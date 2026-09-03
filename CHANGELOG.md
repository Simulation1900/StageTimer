# Changelog — Simulation Timer

A real-time synchronised countdown for the simulation centre: one controller
drives any number of display endpoints over WebSockets, so every room shows the
same clock to the second.

Releases are dated. Each entry describes what changed for the people using it,
not the shape of the code.

---

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
