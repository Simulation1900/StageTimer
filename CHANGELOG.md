# Changelog — Simulation Timer

A real-time synchronised countdown for the simulation centre: one controller
drives any number of display endpoints over WebSockets, so every room shows the
same clock to the second.

Releases are dated. Each entry describes what changed for the people using it,
not the shape of the code.

---

## 2026-09-17 — Timers you can add, and a controller that signs in

### Added
- **Timers can be added and removed from the controller**, up to nine. Which
  timers exist, and what rooms call them, is kept on disk now — so a name
  survives a restart, which it never did before, and the list survives a
  deploy because it lives outside the folder a deploy replaces. Five are
  permanent. One that was added, never named, never used and has nobody
  watching it is tidied away after a day; naming a timer keeps it, because a
  name is what tells an accident from a room assignment.
- **The controller signs in with a BUCIES HUB account.** Displays and the
  director stay open to anyone: a wall panel has to survive everything, and a
  read-only board of clocks shows nothing that is not already on nine walls.
  This service never handles a password — signing in happens at the hub, which
  sends the person back with a single-use code. That also keeps every
  controller in the building out of the account service's per-address failure
  throttle, which they would otherwise have shared.
- **Pages notice when the server is serving newer ones**, and reload
  themselves: the controller and the director at once, a display only once its
  timer is stopped and no blackout or message is up, so a room never sees the
  clock blink mid-session. The fingerprint is of the pages' content rather than
  the moment the server started, because this app has no Always On and is
  stopped and started all day.
- An emergency password for the controller, offered only after signing in has
  actually failed, lasting four hours and written to the log when used.

### Fixed
- **The controller password was only ever checked in the browser.** The server
  told the page whether the password was right and then accepted commands from
  any client that asked, so the gate was decoration. Commands now require an
  account, checked on the server, on every connection including reconnections.
- The Belmont mark was navy ink on a transparent ground and all but vanished
  against a dark page.

## 2026-09-17 — Five timers

### Added
- **Two more timers.** Five rooms can now be timed at once rather than three.
  Timers 4 and 5 behave exactly as the others do, each with its own name,
  message, display theme and mode, and its own hue on the controller so you
  always know which one you are holding. A display reaches them the same way:
  the tabs along the top, the number keys, or `?timer=4` in the address.

## 2026-09-08 — A blacked-out screen stays put

### Changed
- **Blackout now suppresses the idle drift.** Blacking out a display is an
  instruction to show nothing, and the screen is already dark, so there is
  nothing for drifting to improve — all it did was move the clock somewhere
  unexpected while nobody could see it, which is where it reappeared when the
  blackout lifted. Raising the blackout also settles a drift already under way.
- **The idle wait is five minutes, down from thirty.** Half an hour was long
  enough that a room could sit finished and lit for most of a session first.
  It still takes both no touch and no timer running. A triple-tap drift is
  unaffected: it is deliberate, and only a deliberate act dismisses it.

## 2026-09-03 — Controlling the displays from the controller

### Added
- **Display theme control.** The controller can hold every display on a timer in
  light or dark from one place, for scenarios run in a darkened room. `Auto`
  leaves each display on its own preference, which is how it behaved before.
  The hold is per timer, so a night scenario on one timer leaves the others
  alone, and the operator keeps their own theme either way.
- **Display mode control.** The same treatment for the view itself — every
  display on a timer can be held on the clock (`Focus`) or on the ambient
  waves (`Calm`).
- **Idle drift.** After thirty minutes with nobody touching a display and no
  timer running, the clock sets itself adrift over the waves. It returns to
  exactly the view it left the moment a timer starts from the controller, or
  anyone touches the screen. It never starts mid-session, and it does not
  overwrite what that display is configured to show.

### Changed
- A display being held shows it: its own theme toggle and view buttons stand
  down, and the keyboard shortcuts say who is holding them rather than
  appearing to do nothing.
- A display that reloads mid-scenario is stamped with its held theme before
  first paint, so it no longer flashes white in a darkened room.

### Fixed
- The triple-tap drift gesture no longer relies on the browser's own
  multi-click counter, which touchscreens report inconsistently. It counts taps
  itself — three within 600ms, landing near each other — so it works on the
  touchscreen displays it was meant for. Slow or scattered taps still do
  nothing.

---

## 2026-08-31 — A clock that wanders

### Added
- A triple-tap on the display sets the clock adrift, bouncing slowly around the
  screen over the ambient view, with a quiet acknowledgement on the rare true
  corner hit. Deliberately not persisted: it never survives into a real session
  by accident.

### Fixed
- The drifting clock now reaches the true screen edges rather than stopping
  short of them.

---

## 2026-08-28 — Calm mode and one visual language

### Added
- **Calm mode**, an ambient view where the remaining time is read from a field
  of slow waves rather than digits — for the long stretches where a precise
  count is a distraction.
- Screen wake lock, so display machines stop sleeping partway through a
  session.
- Auto-hiding chrome: controls fade out after a period of stillness, leaving a
  wall display showing just the timer.

### Changed
- Every page now shares one design language — a single quiet palette, one
  typeface, light and dark — instead of three separately styled screens.

### Fixed
- **Timer drift.** The countdown is no longer streamed tick by tick. The server
  publishes the instant a timer ends plus its own clock reading, and each
  display derives the remaining time locally. Nothing accumulates error across a
  ninety-minute run, a missed tick costs nothing, and a display that reconnects
  after a dropped connection lands on the exact right number.

---

## 2026-03-19 — Three timers and a director view

### Added
- **Multi-timer support.** Three independent timers, each with its own name,
  message and blackout state. Displays subscribe to the one they need.
- **Director mode**, a single screen showing all three timers at once.
- Time adjustment while running — add or remove time without stopping the
  clock.

---

## 2025-10-28 — Server-authoritative timing

### Fixed
- The countdown ran at the wrong speed when a display's tab was backgrounded.
  Timer state moved to the server, making it the single source of truth for
  every connected display.

---

## 2025-10-27 — Initial release

### Added
- Password-protected controller driving synchronised display endpoints over
  WebSockets.
- Set, start, pause and reset; custom messages in neutral, urgent or positive
  colours; blackout mode.
- Progress bar with colour warnings as time runs short.
- Azure App Service deployment with GitHub Actions CI/CD.
