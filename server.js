const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const timerSet = require('./lib/timerSet');
const auth = require('./lib/auth');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;
const HUB_URL = (process.env.HUB_URL || 'https://bucies.netlify.app').replace(/\/+$/, '');

app.use(express.json());
app.use(express.static('public'));

/* A running timer is stored as the wall-clock instant it ends, not as a
   decrementing counter. Nothing accumulates error, a missed tick costs
   nothing, and a client that reconnects after a gap lands on the exact
   right number. `remainingMs` only carries the value while paused. */
function createTimerState(name) {
  return {
    totalSeconds: 0,
    remainingMs: 0,
    endsAt: null,
    isRunning: false,
    timerName: name,
    message: { text: '', color: 'black' },
    isBlackedOut: false,
    /* 'auto' leaves each display on its own preference; the other
       values are imposed on every display watching this timer. */
    displayTheme: 'auto',
    displayMode: 'auto'
  };
}

/* Which timers exist is persisted (see lib/timerSet.js); what each one is
   counting is not, and never has been. */
timerSet.load();

const timers = {};
timerSet.list().forEach((t) => { timers[t.id] = createTimerState(t.name); });

const exists = (timerId) => Object.prototype.hasOwnProperty.call(timers, timerId);

/* Displays that have joined a timer, by id. Controllers and directors are not
   counted: they join everything, so counting them would mean no timer is ever
   idle and the controller's "2 displays are watching" would be counting the
   operator's own screen. */
const watchers = new Map();
const watcherCount = (timerId) => (watchers.get(timerId) || new Set()).size;

function addWatcher(timerId, socket) {
  if (!watchers.has(timerId)) watchers.set(timerId, new Set());
  watchers.get(timerId).add(socket.id);
}

function dropWatcher(timerId, socket) {
  const set = watchers.get(timerId);
  if (set) set.delete(socket.id);
}

function remainingMs(timer) {
  if (timer.isRunning && timer.endsAt != null) {
    return Math.max(0, timer.endsAt - Date.now());
  }
  return Math.max(0, timer.remainingMs);
}

/* Paused *mid-run*, which is a session in progress — not a timer that was set
   to ten minutes and never started. The two look identical unless the
   remaining time is compared with the total. */
const pausedMidRun = (t) =>
  !t.isRunning && t.remainingMs > 0 && t.remainingMs < t.totalSeconds * 1000;

/* A timer nobody may quietly take away: it is counting, mid-pause, holding a
   room dark, or a display is looking at it. */
function isBusy(timerId) {
  const t = timers[timerId];
  if (!t) return false;
  return t.isRunning || pausedMidRun(t) || t.isBlackedOut || watcherCount(timerId) > 0;
}

/* What goes over the wire. `serverNow` lets each client work out the
   offset between our clock and its own, so all displays agree. */
function snapshot(timerId) {
  const t = timers[timerId];
  const entry = timerSet.get(timerId) || {};
  const left = remainingMs(t);
  return {
    timerId,
    totalSeconds: t.totalSeconds,
    remainingMs: left,
    remainingSeconds: Math.ceil(left / 1000),
    endsAt: t.isRunning ? t.endsAt : null,
    isRunning: t.isRunning,
    timerName: t.timerName,
    message: t.message,
    isBlackedOut: t.isBlackedOut,
    displayTheme: t.displayTheme,
    displayMode: t.displayMode,
    /* About the timer rather than its clock: what the controller needs to
       know whether it may be removed. */
    base: entry.base === true,
    named: entry.named === true,
    lastUsedAt: entry.lastUsedAt || null,
    watchers: watcherCount(timerId),
    serverNow: Date.now()
  };
}

function allSnapshots() {
  const out = {};
  timerSet.ids().forEach((id) => { if (exists(id)) out[id] = snapshot(id); });
  return out;
}

/* Controllers and directors ask for everything. They are kept in a room of
   their own rather than joined to each timer's room one by one, because that
   would be a snapshot of the timers that existed at the time — a timer created
   afterwards would never reach them, and its tab would sit dead. */
const ALL = 'all-timers';

function broadcast(timerId) {
  if (!exists(timerId)) return;
  io.to(timerId).to(ALL).emit('timerState', { timerId, state: snapshot(timerId) });
}

/* The set itself changed. The keys of this message are the list, so there is
   one message and one path on the client rather than two that could arrive in
   either order. */
function broadcastSet() {
  io.emit('allTimerStates', allSnapshots());
}

function finish(timerId) {
  const t = timers[timerId];
  t.isRunning = false;
  t.endsAt = null;
  t.remainingMs = 0;
  broadcast(timerId);
}

/* One supervisor for every timer. It does not drive the countdown —
   clients do that themselves — it only catches the moment a timer reaches
   zero, and periodically re-publishes running timers so any client whose
   clock has wandered is pulled back into line. */
const TICK_MS = 250;
const RESYNC_MS = 10000;
let sinceResync = 0;

setInterval(() => {
  sinceResync += TICK_MS;
  const resync = sinceResync >= RESYNC_MS;
  if (resync) sinceResync = 0;

  timerSet.ids().forEach((id) => {
    const t = timers[id];
    if (!t || !t.isRunning) return;
    if (remainingMs(t) <= 0) finish(id);
    else if (resync) broadcast(id);
  });
}, TICK_MS);

/* Tidying. An added timer that was never named, never used and has nobody
   looking at it is one somebody made by accident; a named one is a room
   assignment and is left alone however long it sits.

   Deliberately not run at boot: nothing is running and no display has
   reconnected yet, so a restart would sweep timers that are in daily use. */
const SWEEP_MS = 60 * 60 * 1000;

setInterval(() => {
  const removed = timerSet.sweep(isBusy);
  if (!removed.length) return;

  removed.forEach(({ id }) => {
    io.in(id).socketsLeave(id);
    watchers.delete(id);
    delete timers[id];
  });
  broadcastSet();
}, SWEEP_MS).unref?.();

/* ── Signing in ───────────────────────────────────────────────────────────
   Displays and the director need no account: a wall panel must survive
   everything, and a read-only board of clocks shows nothing that is not
   already on nine walls. The controller drives every screen in the centre,
   so it signs in with a BUCIES HUB account.

   The Timer never sees anyone's password. Sign-in happens at the hub, which
   sends the person back with a single-use code; that code is redeemed here
   with this service's own credential. Besides being less to get wrong, it
   keeps the Timer out of the overtime tracker's per-address login throttle,
   which counts failures per calling address — and every controller in the
   building would have shared this one. */

app.get('/auth/hub-start', (req, res) => {
  res.redirect(`${HUB_URL}/?next=timer`);
});

app.get('/auth/me', (req, res) => {
  const session = auth.readSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: { email: session.email, name: session.name, role: session.role }, via: session.via || 'hub' });
});

app.post('/auth/handoff', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing sign-in code' });

  let user;
  try {
    user = await auth.redeemHandoff(String(code));
  } catch (err) {
    console.error('[auth] hand-off could not be redeemed:', err.message);
    return res.status(503).json({ error: 'Sign-in is unavailable right now.' });
  }

  if (!user) return res.status(401).json({ error: 'That sign-in link has expired. Open the Timer from the hub again.' });

  console.log(`[auth] ${user.email} signed in from the hub`);
  res.setHeader('Set-Cookie', auth.sessionCookie(auth.signSession(user)));
  res.json({ user: { email: user.email, name: user.name, role: user.role }, via: 'hub' });
});

/* The way in when the hub or the account service cannot be reached, which is
   the one time the timer is most needed. Offered by the page only after a
   sign-in has actually failed, so it does not become the habit. */
app.post('/auth/emergency', (req, res) => {
  const { password } = req.body || {};
  if (!auth.breakGlassOffered()) return res.status(404).json({ error: 'No emergency password is configured.' });
  if (!password || !auth.breakGlassMatches(password)) return res.status(401).json({ error: 'That password is not right.' });

  const who = { id: 'emergency', email: 'emergency', name: 'Emergency access', role: 'operator' };
  console.warn(`[auth] emergency password used from ${req.ip}`);
  res.setHeader('Set-Cookie', auth.sessionCookie(auth.signSession(who, 'emergency'), auth.EMERGENCY_TTL_HOURS));
  res.json({ user: { email: who.email, name: who.name, role: who.role }, via: 'emergency' });
});

app.get('/auth/options', (req, res) => {
  res.json({ hub: `${HUB_URL}/?next=timer`, emergency: auth.breakGlassOffered() });
});

app.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', auth.clearCookie());
  res.json({ ok: true });
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller.html')));
app.get('/endpoint', (req, res) => res.sendFile(path.join(__dirname, 'public', 'endpoint.html')));
app.get('/director', (req, res) => res.sendFile(path.join(__dirname, 'public', 'director.html')));

/* The session is read once, from the handshake, and carried on the socket.
   Reading a cookie beats a "this socket authenticated" flag precisely here:
   the flag is lost on every reconnect — an Azure recycle, a deploy, a room's
   Wi-Fi blinking — and a controller left open on a desk would start refusing
   commands with nothing on screen to say why. The cookie is re-sent by the
   browser every time, so a reconnect is silent.

   Expiry is therefore only felt at the next reconnect, which is what we want:
   a session does not lapse out from under someone mid-scenario. */
io.use((socket, next) => {
  socket.data.user = auth.readSession(socket.request) || null;
  next();
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.emit('allTimerStates', allSnapshots());

  const signedIn = () => Boolean(socket.data.user);

  /* Commands change what every screen in the centre shows, so they need an
     account. A refusal is answered rather than dropped, so the controller can
     put the sign-in overlay up instead of looking broken. */
  function mayCommand() {
    if (signedIn()) return true;
    socket.emit('timerError', { message: 'Sign in to continue.', needsSignIn: true });
    return false;
  }

  /* Reading is open: that is the display, and the director. */
  const command = (timerId) => mayCommand() && exists(timerId);

  socket.on('joinTimer', (timerId) => {
    if (!exists(timerId)) return;
    socket.join(timerId);
    addWatcher(timerId, socket);
    timerSet.touch(timerId);
  });

  socket.on('leaveTimer', (timerId) => {
    socket.leave(timerId);
    dropWatcher(timerId, socket);
  });

  socket.on('joinAll', () => {
    socket.join(ALL);
  });

  socket.on('createTimer', ({ name } = {}) => {
    if (!mayCommand()) return;

    const result = timerSet.create(name);
    if (result.error) return socket.emit('timerError', { message: result.error });

    timers[result.timer.id] = createTimerState(result.timer.name);
    console.log(`[timers] ${socket.data.user.email} added ${result.timer.id} ("${result.timer.name}")`);
    broadcastSet();
  });

  socket.on('deleteTimer', ({ timerId } = {}) => {
    if (!mayCommand()) return;
    if (!exists(timerId)) return socket.emit('timerError', { message: 'That timer no longer exists.' });

    const t = timers[timerId];
    if (t.isRunning) return socket.emit('timerError', { message: 'That timer is running. Stop it first.' });
    if (pausedMidRun(t)) return socket.emit('timerError', { message: 'That timer is paused part-way through. Reset it first.' });
    if (t.isBlackedOut) return socket.emit('timerError', { message: 'That timer is blacking out its displays. Turn Blackout off first.' });

    const result = timerSet.remove(timerId);
    if (result.error) return socket.emit('timerError', { message: result.error });

    /* Put the displays out of the room, or a socket would linger in it and be
       counted as watching whichever timer takes the number next. */
    io.in(timerId).socketsLeave(timerId);
    watchers.delete(timerId);
    delete timers[timerId];

    console.log(`[timers] ${socket.data.user.email} removed ${timerId} ("${result.removed.name}")`);
    broadcastSet();
  });

  // Timer control events — all require { timerId }
  socket.on('setTimer', ({ timerId, seconds }) => {
    if (!command(timerId)) return;
    const t = timers[timerId];
    t.totalSeconds = Math.max(0, seconds | 0);
    t.remainingMs = t.totalSeconds * 1000;
    t.endsAt = null;
    t.isRunning = false;
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  socket.on('startTimer', ({ timerId }) => {
    if (!command(timerId)) return;
    const t = timers[timerId];
    if (t.isRunning || t.remainingMs <= 0) return;
    t.endsAt = Date.now() + t.remainingMs;
    t.isRunning = true;
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  socket.on('pauseTimer', ({ timerId }) => {
    if (!command(timerId)) return;
    const t = timers[timerId];
    t.remainingMs = remainingMs(t);
    t.endsAt = null;
    t.isRunning = false;
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  socket.on('resetTimer', ({ timerId }) => {
    if (!command(timerId)) return;
    const t = timers[timerId];
    t.remainingMs = t.totalSeconds * 1000;
    t.endsAt = null;
    t.isRunning = false;
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  /* Add or remove time without stopping the clock — "give them two more
     minutes" mid-run. Extending past the original duration raises the
     total too, so the progress bar stays meaningful. */
  socket.on('adjustTimer', ({ timerId, deltaSeconds }) => {
    if (!command(timerId)) return;
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta === 0) return;

    const t = timers[timerId];
    const next = Math.max(0, remainingMs(t) + delta * 1000);

    if (next > t.totalSeconds * 1000) t.totalSeconds = Math.ceil(next / 1000);

    timerSet.touch(timerId);

    if (t.isRunning) {
      if (next === 0) return finish(timerId);
      t.endsAt = Date.now() + next;
      t.remainingMs = next;
    } else {
      t.remainingMs = next;
    }
    broadcast(timerId);
  });

  /* Naming a timer is what marks it as a room assignment rather than one
     somebody made by accident, and it is what keeps the tidying off it. */
  socket.on('updateTimerName', ({ timerId, name }) => {
    if (!command(timerId)) return;
    const entry = timerSet.rename(timerId, name);
    if (!entry) return;
    timers[timerId].timerName = entry.name;
    broadcast(timerId);
  });

  socket.on('sendMessage', ({ timerId, text, color }) => {
    if (!command(timerId)) return;
    timers[timerId].message = { text, color };
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  socket.on('clearMessage', ({ timerId }) => {
    if (!command(timerId)) return;
    timers[timerId].message = { text: '', color: 'black' };
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  socket.on('toggleBlackout', ({ timerId, isBlackedOut }) => {
    if (!command(timerId)) return;
    timers[timerId].isBlackedOut = isBlackedOut;
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  /* Light or dark for every display on this timer at once, so a room
     can be dimmed for a night scenario from one place. */
  socket.on('setDisplayTheme', ({ timerId, theme }) => {
    if (!command(timerId)) return;
    if (!['auto', 'light', 'dark'].includes(theme)) return;
    timers[timerId].displayTheme = theme;
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  /* Focus or calm for every display on this timer, so a room can be
     settled into the ambient view without walking to each machine. */
  socket.on('setDisplayMode', ({ timerId, mode }) => {
    if (!command(timerId)) return;
    if (!['auto', 'focus', 'calm'].includes(mode)) return;
    timers[timerId].displayMode = mode;
    timerSet.touch(timerId);
    broadcast(timerId);
  });

  socket.on('disconnect', () => {
    watchers.forEach((set) => set.delete(socket.id));
    console.log('Client disconnected:', socket.id);
  });
});

/* A display that has sat on a timer for a week is using it, so its idle clock
   is kept moving for as long as it is connected — not only when it arrives. */
setInterval(() => {
  watchers.forEach((set, timerId) => { if (set.size) timerSet.touch(timerId); });
}, 5 * 60 * 1000).unref?.();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    timerSet.flush();
    process.exit(0);
  });
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
