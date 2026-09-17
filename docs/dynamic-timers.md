# Adding and removing timers at runtime, and signing in to the controller

**Status:** built, not deployed. Reviewed twice; both rounds of findings are
folded in, and the decisions below were settled by the owner.

**Decisions taken**

- **The permanent set is five**, matching what is deployed. The 24-hour rule
  applies only to timers added from now on, so nothing that exists today can
  be swept and no migration is needed.
- **Sign-in is through the hub only.** The Timer never handles a password,
  which also keeps every controller in the building out of the account
  service's per-address failure throttle — five failed sign-ins from anywhere
  would otherwise have locked out the whole centre for fifteen minutes.
- **The director stays open**, like the displays. It is a read-only board of
  clocks, often left on an unattended monitor, and shows nothing that is not
  already on the walls.
- **The emergency password stays**, offered only after a sign-in has actually
  failed, with a four-hour session, labelled in the header and logged. The
  value in source is replaced at rollout.

**Still to do before this ships:** rotate the emergency password, register the
Timer as a service client, set its settings on Azure, and deploy the hub
alongside it — see "Rolling it out" at the end.

Two changes that land together:

1. The number of timers stops being a constant and becomes something an
   operator can change from the controller, within limits, surviving restarts.
2. The controller and the director stop using a shared password and sign in
   with a BUCIES HUB account. Displays stay open to anyone.

---

## Part one — the timers

### What people should be able to do

- Add a timer from the controller when another room joins a session.
- Name it as they would any other timer.
- Delete one they added, once it is finished with.
- Not have a room's timer disappear from a wall by surprise. Ever.

### Rules

| | |
|---|---|
| **Base timers** | 5 (`TIMER_BASE`), matching what is deployed. Always present, never deletable. |
| **Maximum** | 9 (`TIMER_MAX`). The number keys on a display stop there, and nine muted hues is the limit before they stop being tellable apart. |
| **Idle removal** | An added timer that is **unused, unwatched and still unnamed** for 24 hours is removed. A timer anyone has named is never removed automatically. |
| **Who may add or remove** | Anyone signed in with a BUCIES HUB account. |

Anyone with an account can drive the timers — the account service has
employee, manager and admin roles, and none is required over another. For a
timer that is the right call; it is worth stating so it is a choice rather
than an oversight.

#### Why naming exempts a timer

The point of the sweep is that a tab strip should not fill with timers someone
made by accident. It is not to reclaim anything — an unused tab costs nothing,
and the cap already bounds the strip.

A name is the difference. "Timer 6" is a timer somebody made and forgot.
"Sim Lab B" is a room assignment, and a panel in that room is probably pointed
at it. Removing that on the Saturday of a quiet weekend means Monday's educator
finds three tabs, a wall panel showing another room's clock, and no explanation.
That is the failure this rule exists to prevent, and it is worth more than the
tidiness the sweep buys.

So: unnamed and untouched for 24 hours, removed. Named, ever, kept until a
person deletes it. An added timer's settings panel shows "last used 12 days
ago" so tidying stays easy to do by hand.

#### What counts as use

An added timer is in use — and its idle clock restarts — when any command
touches it (set, start, pause, reset, adjust, rename, message, blackout,
display theme or mode), while it is running or paused with time on the clock,
while it is blacked out, and while any **display** is watching it.

"Display" means a socket that called `joinTimer`, not the controller or
director: those join every timer, so counting them would mean nothing is ever
sweepable and the controller's "2 displays are watching" warning would be
counting the operator's own screen.

Watching refreshes the idle clock continuously, not only when the display
connects, so a panel left on a timer for a week holds it open.

**No sweep runs at boot.** At boot nothing is running and no display has
reconnected yet, so two of the three tests are false by definition and a
restart would sweep timers that are in daily use. The hourly sweep, once
displays are back, is enough.

#### The five that exist today

They are the base, so nothing deployed can be swept and there is no migration
to get wrong. Timers 6 to 9 are the ones an operator adds, and the ones the
24-hour rule applies to.

Worth knowing why this mattered: names have never survived a restart until
now, so staff learned that naming a timer was pointless and rooms have been
using "Timer 4" as "Timer 4" for a year. Under a base of 3 those would have
counted as unnamed — and been swept the day after this shipped.

### Ids

`timer-<n>`, `n` from 1 to 9, always the **lowest free number**, so a display's
`4` key reaches the fourth tab rather than the seventh. An id is never
renumbered while it exists.

The honest cost: delete `timer-4` and add a timer for another room, and the new
one is also `timer-4`. A kiosk URL of `?timer=4` then shows the new room's
timer, and the theme held for the old occupant in that browser's storage
(`timer.display.timer-4`) is picked up by the new one. The displayed name is
the mitigation — it is on screen at all times. The alternative, never reusing a
number, breaks the number keys after a few deletions, which is worse.

### Ordering

Clients sort by id number, so tab order matches key number.

### Persistence

The countdown stays in memory. A restart has always dropped a running
countdown and still does.

What survives is the **set**: which timers exist and what they are called.

```jsonc
{
  "version": 1,
  "timers": [
    { "id": "timer-1", "name": "Timer 1", "base": true },
    { "id": "timer-4", "name": "Sim Lab B", "base": false,
      "createdAt": "2026-09-17T14:02:11Z",
      "lastUsedAt": "2026-09-17T15:40:03Z",
      "named": true }
  ]
}
```

**Location.** A ZIP deploy replaces `wwwroot` wholesale, so a file beside the
code is wiped on every deploy. `process.env.HOME` is persistent on App Service
and is set on both Windows (`D:\home`) and Linux, so the file lives at
`$HOME/data/timers.json`, falling back to a gitignored `./data/` locally.
`/home` on Linux App Service is an SMB mount, so rename-over-file is
best-effort rather than POSIX-atomic — still far better than writing in place.

**Failure.** A missing file means first run: seed and continue. An unreadable
file is renamed to `timers.json.bad` and the app starts from the base set, so a
first flush cannot destroy something recoverable. A timer app that will not
boot because of a bad JSON file is worse than one that has forgotten a name.

**Write volume.** The file is written when the set changes. `lastUsedAt` is
held in memory and flushed at most once a minute and on shutdown; losing a
minute of it costs nothing.

**Single instance is assumed**, as it already is — timer state has always been
in memory. Two instances would fight over the file and disagree about the
clock. Scaling out needs a different design.

### Server

#### Messages

| Event | From | Payload |
|---|---|---|
| `createTimer` | controller | `{ name? }` |
| `deleteTimer` | controller | `{ timerId }` |
| `timerError` | server → caller | `{ message }` |

There is **no separate `timerList`**. The keys of `allTimerStates` are the
list, and it already carries the names; each snapshot gains `base`, `named`,
`lastUsedAt` and `watchers`. The whole thing is re-sent to everyone whenever
the set changes — nine small objects. One message, one client path, and no
question about which of two messages arrives first.

#### Subscriptions

`joinAll` currently joins the rooms that exist at that moment, so a controller
connected before a timer was created never receives that timer's state: its tab
would sit at 00:00 while the timer ran. Controllers and directors are marked as
wanting everything, and `broadcast()` addresses both the timer's room and an
`all` room. A newly created timer is therefore live on every open controller
without a reload.

`deleteTimer` calls `socketsLeave` on the room, so a display cannot linger in a
room for a deleted timer and be counted as a watcher when the id is reused.

#### Refusals

`createTimer` fails when: not signed in, or already at `TIMER_MAX`.

`deleteTimer` fails when: not signed in, the timer is a base timer, it does not
exist, or **it is running, paused with time left, or blacked out**. Pausing for
a debrief and resuming is routine, so a paused timer is a session in progress;
and deleting a blacked-out timer would turn a deliberately darkened room's
screen back on.

Deleting a timer that displays are watching is allowed, with the controller
warning first and naming how many.

### Clients

`app.js` keeps the server's list rather than generating one, defaulting to the
base until the first `allTimerStates` arrives. `store.ids` stays the same array
object — pages hold a reference to it — with its contents replaced and
listeners told. Default state is seeded for any id in the list, and updates are
emitted for the keys actually received rather than a fixed list.

**A display never writes a fallback into its URL.** The `?timer=` parameter is
the panel's only configuration; today the display resolves it synchronously
against a hardcoded list and then rewrites the address, which would send every
panel on `?timer=4` back to Timer 1 permanently on the first load after this
change. Instead the display remembers what it was *asked* for, separately from
what it can currently show.

When the requested timer is absent — not arrived yet, deleted, or swept — the
display shows a **holding screen** naming it ("Timer 4 — not available") rather
than another room's clock, and returns to it by itself if it reappears. A wrong
number on a wall in a room where numbers matter is worse than an obvious blank.

The controller does **not** silently switch tabs when the timer in view is
removed: it disables the controls and says which timer went, so a Space press
meant for Room 4 cannot start Room 1 mid-session.

**Nine tabs do not fit the display's header**, which also holds the mode
switch, three buttons and the logo. Above five timers the display's tabs show
the number alone, with the full name still on the stage; the strip scrolls if
it must. The keyboard hint in the footer is generated rather than hardcoded to
`1 2 3`.

Nine hues, extending the existing muted set in both themes, assigned by id
number so a timer keeps its colour for life.

---

## Part two — signing in

Today the controller password is checked **in the browser only**: the server
tells the page whether the password was right and then accepts timer commands
from any connected socket regardless. Anyone who can reach the site can drive
every display.

### The shape

- **Displays stay open.** No sign-in, no session, nothing to expire on a wall
  panel. This is deliberate: a display must survive anything.
- **The controller and the director require a BUCIES HUB account** — the same
  account as every other app in the suite.
- **Commands require a session**, checked on the server. This closes the hole
  above.

### How

The Timer becomes a service client of the Time Tracker (`timer`), exactly as
ERM and the others are:

- `POST /auth/login` — email and password, verified by asking the Time Tracker,
  and answered with the Timer's own session cookie (HttpOnly, Secure,
  SameSite=Lax, 12 hours).
- `POST /auth/handoff` — a single-use code from the hub, redeemed with the
  Timer's service credential, answered with the same cookie. The hub gains a
  `timer` audience and its tile signs people straight through.
- `GET /auth/me`, `POST /auth/logout`.
- `GET /controller` and `/director` require the cookie; without it they show a
  sign-in page carrying the standard copy ("your BUCIES HUB account… this
  password may be different from your Belmont password").

Socket.IO reads the same cookie from its handshake. This also fixes a problem a
server-side "authenticated" flag would have had: a flag is lost on every
reconnect — Azure recycles, deploys, a Wi-Fi blip — so a controller left open
for a day would have started silently refusing commands until someone reloaded.
A cookie is re-sent on every reconnect automatically.

### Break-glass

If the Time Tracker is unreachable nobody can sign in, and the timer is needed
mid-session. `CONTROLLER_PASSWORD` therefore still works if the setting exists,
and the sign-in page offers it as a second option. Deleting the setting turns
it off. **Yours to decide** — say if you would rather it be hub-only.

### Settings

`SESSION_SECRET`, `TIMETRACKER_API_URL`, `TIMETRACKER_SERVICE_KEY`,
`SESSION_TTL_HOURS` (12), `TIMER_BASE` (3), `TIMER_MAX` (9),
`CONTROLLER_PASSWORD` (optional break-glass).

---

## What this does not do

- **The countdown still does not survive a restart.** Unchanged, out of scope.
- **No more than 9.** Past that the number keys run out and the hues stop being
  distinguishable.
- **Not multi-instance.** Stated above.

## How it will be tested

There are no tests in this repo today; these are added with the change. Server
behaviour is driven through a real `socket.io-client` against a spawned server,
and the pages through a headless browser, as the other apps in the suite are.

1. Add a timer: it appears on an already-open controller, display and director
   without a reload, and can be driven immediately.
2. Nine is the cap; the tenth is refused and the control is disabled.
3. Delete an added timer: watching displays show a holding screen, not another
   timer, and the controller disables rather than switches.
4. Running, paused-with-time, and blacked-out timers cannot be deleted.
5. A base timer cannot be deleted.
6. Signed out, `createTimer` and `deleteTimer` are refused; a display needs no
   session; a reconnect keeps working without re-authenticating.
7. Restart: the set and names come back; nothing is swept at boot.
8. The sweep takes an unnamed, unused, unwatched timer, and keeps: a named one,
   a running one, a paused one, a blacked-out one, one watched by a display,
   and one used within the day. Driven by writing `lastUsedAt` into the past.
9. Ids fill the lowest free gap; an existing timer is never renumbered.
10. A display asked for a timer that does not exist yet adopts it when it
    appears, and never rewrites its own `?timer=`.

---

## Changed from v1, after review

- **The sweep no longer removes named timers**, and does not run at boot. v1
  would have removed a named room's timer over a weekend.
- **No silent fallback to Timer 1** on either the display or the controller.
- **The display no longer rewrites its own URL**, which in v1 would have moved
  every panel on `?timer=4` to Timer 1 permanently.
- **`joinAll` fixed**: a timer created after a controller connected would have
  appeared dead.
- **Initial state is pushed on create**, and clients seed state for any id they
  are told about.
- **`timerList` dropped** in favour of re-sending `allTimerStates`.
- **Delete refusals widened** to paused and blacked-out.
- **Sessions instead of a socket auth flag**, which would have been lost on
  every reconnect.
- **Rooms are left on delete**, so a ghost watcher cannot hold a reused id open.
- Persistence uses `$HOME`, quarantines a bad file, and states single-instance.
- Display tabs degrade to numbers past five; the keyboard hint is generated.

---

## Rolling it out

Nothing here is deployed. In order:

1. **Rotate the emergency password.** The value in `server.js` was a default in
   source and is in the git history. Set `CONTROLLER_PASSWORD` on the Timer's
   app settings to something new; unset it entirely to turn the fallback off.
2. **Register the Timer as a service client.** Add `timer:<secret>` to
   `SERVICE_CLIENTS` on the Time Tracker, and set
   `TIMETRACKER_SERVICE_KEY=timer.<secret>` on the Timer.
3. **Set the Timer's other settings:** `SESSION_SECRET` (or every restart signs
   everyone out), `TIMETRACKER_API_URL`, `HUB_URL`. Optionally `TIMER_BASE`,
   `TIMER_MAX`, `TIMER_IDLE_HOURS`, `SESSION_TTL_HOURS`.
4. **Deploy the hub at the same time as the Timer.** The hub carries the
   `timer` audience and the `?next=` return; without it the controller's sign-in
   button leads somewhere that cannot send anyone back.
5. **Check `$HOME/data/timers.json` appears** after the first boot, and that a
   deploy does not remove it.

The order matters in one respect: deploying the Timer before the Time Tracker
knows about it means the hand-off is refused and the only way in is the
emergency password.

## What was built

- `lib/timerSet.js` — the persisted set: seeding, adding, removing, renaming,
  the idle sweep, and a damaged file quarantined rather than overwritten.
- `lib/auth.js` — sessions, hand-off redemption, the emergency password.
- `server.js` — the `all` room, commands behind a session, create and delete
  with their refusals, watcher counting, the hourly sweep, the auth routes.
- `public/app.js` — the client store follows the server's list.
- `public/controller.html` — sign-in, the tab strip, adding and removing.
- `public/endpoint.html` — requested-versus-shown, the holding screen.
- `public/director.html` — cards follow the list.
- The hub: a `timer` audience, the tile, and `?next=` to come back.

Tests, all passing: 31 on the set module, 28 against a real server over
sockets, 24 against the pages in a browser.
