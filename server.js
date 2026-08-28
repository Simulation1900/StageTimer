const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const TIMER_IDS = ['timer-1', 'timer-2', 'timer-3'];

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
    isBlackedOut: false
  };
}

const timers = {
  'timer-1': createTimerState('Timer 1'),
  'timer-2': createTimerState('Timer 2'),
  'timer-3': createTimerState('Timer 3')
};

function remainingMs(timer) {
  if (timer.isRunning && timer.endsAt != null) {
    return Math.max(0, timer.endsAt - Date.now());
  }
  return Math.max(0, timer.remainingMs);
}

/* What goes over the wire. `serverNow` lets each client work out the
   offset between our clock and its own, so all displays agree. */
function snapshot(timerId) {
  const t = timers[timerId];
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
    serverNow: Date.now()
  };
}

function allSnapshots() {
  const out = {};
  TIMER_IDS.forEach((id) => { out[id] = snapshot(id); });
  return out;
}

function broadcast(timerId) {
  io.to(timerId).emit('timerState', { timerId, state: snapshot(timerId) });
}

function finish(timerId) {
  const t = timers[timerId];
  t.isRunning = false;
  t.endsAt = null;
  t.remainingMs = 0;
  broadcast(timerId);
}

/* One supervisor for all three timers. It does not drive the countdown —
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

  TIMER_IDS.forEach((id) => {
    const t = timers[id];
    if (!t.isRunning) return;
    if (remainingMs(t) <= 0) finish(id);
    else if (resync) broadcast(id);
  });
}, TICK_MS);

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller.html')));
app.get('/endpoint', (req, res) => res.sendFile(path.join(__dirname, 'public', 'endpoint.html')));
app.get('/director', (req, res) => res.sendFile(path.join(__dirname, 'public', 'director.html')));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send all current timer states on connection
  socket.emit('allTimerStates', allSnapshots());

  socket.on('authenticate', (password) => {
    const correctPassword = process.env.CONTROLLER_PASSWORD || 'Belmont1900!';
    socket.emit('authResult', password === correctPassword);
  });

  // Room management — clients subscribe to specific timer(s)
  socket.on('joinTimer', (timerId) => {
    if (TIMER_IDS.includes(timerId)) socket.join(timerId);
  });

  socket.on('leaveTimer', (timerId) => {
    if (TIMER_IDS.includes(timerId)) socket.leave(timerId);
  });

  socket.on('joinAll', () => {
    TIMER_IDS.forEach(id => socket.join(id));
  });

  // Timer control events — all require { timerId }
  socket.on('setTimer', ({ timerId, seconds }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    const t = timers[timerId];
    t.totalSeconds = Math.max(0, seconds | 0);
    t.remainingMs = t.totalSeconds * 1000;
    t.endsAt = null;
    t.isRunning = false;
    broadcast(timerId);
  });

  socket.on('startTimer', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    const t = timers[timerId];
    if (t.isRunning || t.remainingMs <= 0) return;
    t.endsAt = Date.now() + t.remainingMs;
    t.isRunning = true;
    broadcast(timerId);
  });

  socket.on('pauseTimer', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    const t = timers[timerId];
    t.remainingMs = remainingMs(t);
    t.endsAt = null;
    t.isRunning = false;
    broadcast(timerId);
  });

  socket.on('resetTimer', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    const t = timers[timerId];
    t.remainingMs = t.totalSeconds * 1000;
    t.endsAt = null;
    t.isRunning = false;
    broadcast(timerId);
  });

  /* Add or remove time without stopping the clock — "give them two more
     minutes" mid-run. Extending past the original duration raises the
     total too, so the progress bar stays meaningful. */
  socket.on('adjustTimer', ({ timerId, deltaSeconds }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta === 0) return;

    const t = timers[timerId];
    const next = Math.max(0, remainingMs(t) + delta * 1000);

    if (next > t.totalSeconds * 1000) t.totalSeconds = Math.ceil(next / 1000);

    if (t.isRunning) {
      if (next === 0) return finish(timerId);
      t.endsAt = Date.now() + next;
      t.remainingMs = next;
    } else {
      t.remainingMs = next;
    }
    broadcast(timerId);
  });

  socket.on('updateTimerName', ({ timerId, name }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].timerName = name;
    broadcast(timerId);
  });

  socket.on('sendMessage', ({ timerId, text, color }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].message = { text, color };
    broadcast(timerId);
  });

  socket.on('clearMessage', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].message = { text: '', color: 'black' };
    broadcast(timerId);
  });

  socket.on('toggleBlackout', ({ timerId, isBlackedOut }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].isBlackedOut = isBlackedOut;
    broadcast(timerId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
