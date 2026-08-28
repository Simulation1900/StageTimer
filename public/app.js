/* ============================================================
   Shared client helpers for every timer page.

   The important idea here is that the server no longer streams a
   countdown — it publishes an `endsAt` timestamp and its own clock
   reading. Each page derives the remaining time locally from that,
   so the display can never drift, never accumulates error across a
   90-minute run, and comes back exact after a dropped connection.
   ============================================================ */

(function (global) {
    'use strict';

    const TIMER_IDS = ['timer-1', 'timer-2', 'timer-3'];

    /* ── Theme ───────────────────────────────────────────────
       resolve() is also inlined into each page's <head> so the
       correct theme is stamped on <html> before first paint. */

    const Theme = {
        KEY: 'timer.theme',

        stored() {
            try { return localStorage.getItem(Theme.KEY); } catch (e) { return null; }
        },

        resolve() {
            const saved = Theme.stored();
            if (saved === 'dark' || saved === 'light') return saved;
            return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark' : 'light';
        },

        current() {
            return document.documentElement.getAttribute('data-theme') || Theme.resolve();
        },

        apply(theme, persist) {
            document.documentElement.setAttribute('data-theme', theme);
            if (persist !== false) {
                try { localStorage.setItem(Theme.KEY, theme); } catch (e) {}
            }
            document.querySelectorAll('[data-theme-toggle]').forEach(Theme.paintToggle);
        },

        toggle() {
            Theme.apply(Theme.current() === 'dark' ? 'light' : 'dark');
        },

        /* Show the theme you would switch *to*, which is the convention
           people already read correctly without a label. */
        paintToggle(btn) {
            const dark = Theme.current() === 'dark';
            btn.innerHTML = dark
                ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>'
                : '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>';
            btn.setAttribute('title', dark ? 'Switch to light' : 'Switch to dark');
            btn.setAttribute('aria-label', btn.getAttribute('title'));
        },

        init() {
            const params = new URLSearchParams(global.location.search);
            const forced = params.get('theme');
            // Only an explicit toggle writes a preference; a page view never does.
            Theme.apply(forced === 'dark' || forced === 'light' ? forced : Theme.resolve(), false);

            // Follow the OS only while the user has made no explicit choice.
            if (!Theme.stored() && global.matchMedia) {
                global.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
                    document.querySelectorAll('[data-theme-toggle]').forEach(Theme.paintToggle);
                });
            }
        }
    };

    /* ── Time formatting ─────────────────────────────────────
       Hours are dropped below the hour mark: "08:30" reads far
       faster across a room than "00:08:30", and buys bigger digits. */

    function formatClock(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    /* ── Timer state store ───────────────────────────────────
       Holds the last snapshot from the server plus the offset
       between the server's clock and ours. */

    function createStore(socket) {
        const states = {};
        TIMER_IDS.forEach((id) => {
            states[id] = {
                totalSeconds: 0, remainingMs: 0, endsAt: null, isRunning: false,
                timerName: id.replace('timer-', 'Timer '),
                message: { text: '', color: 'black' }, isBlackedOut: false
            };
        });

        let clockOffset = 0;   // serverNow - clientNow, in ms
        const listeners = [];

        function absorb(state) {
            if (typeof state.serverNow === 'number') {
                clockOffset = state.serverNow - Date.now();
            }
            return state;
        }

        function emitUpdate(timerId) {
            listeners.forEach((fn) => fn(timerId));
        }

        socket.on('allTimerStates', (all) => {
            Object.keys(all).forEach((id) => { states[id] = absorb(all[id]); });
            TIMER_IDS.forEach(emitUpdate);
        });

        socket.on('timerState', ({ timerId, state }) => {
            states[timerId] = absorb(state);
            emitUpdate(timerId);
        });

        return {
            ids: TIMER_IDS,
            states,
            socket,

            /* The live figure, interpolated from endsAt against the
               server's clock. Falls back to the paused value. */
            remainingMs(timerId) {
                const t = states[timerId];
                if (!t) return 0;
                if (t.isRunning && t.endsAt != null) {
                    return Math.max(0, t.endsAt - (Date.now() + clockOffset));
                }
                return Math.max(0, t.remainingMs || 0);
            },

            /* Fraction of the original duration still to run, 0..1. */
            fractionLeft(timerId) {
                const t = states[timerId];
                if (!t || !t.totalSeconds) return 1;
                return Math.min(1, Math.max(0, this.remainingMs(timerId) / (t.totalSeconds * 1000)));
            },

            /* 'normal' | 'warning' | 'critical' — the existing
               20% / 5% thresholds, unchanged. */
            level(timerId) {
                const pct = this.fractionLeft(timerId) * 100;
                if (pct <= 5) return 'critical';
                if (pct <= 20) return 'warning';
                return 'normal';
            },

            onUpdate(fn) { listeners.push(fn); }
        };
    }

    /* ── Connection badge ────────────────────────────────────
       Silent when healthy; unmistakable when not. */

    function mountConnection(socket) {
        const badge = document.createElement('div');
        badge.className = 'conn-badge';
        badge.innerHTML = '<span class="conn-dot"></span><span class="conn-text">Connected</span>';
        document.body.appendChild(badge);

        const text = badge.querySelector('.conn-text');
        let restoredTimer = null;
        let everConnected = false;

        function set(cls, label, transient) {
            clearTimeout(restoredTimer);
            badge.className = 'conn-badge visible ' + cls;
            text.textContent = label;
            document.body.classList.toggle('offline', cls === 'offline' || cls === 'reconnecting');
            if (transient) {
                restoredTimer = setTimeout(() => { badge.className = 'conn-badge ' + cls; }, 2600);
            }
        }

        socket.on('connect', () => {
            if (everConnected) set('restored', 'Reconnected', true);
            else badge.className = 'conn-badge';
            document.body.classList.remove('offline');
            everConnected = true;
        });

        socket.on('disconnect', () => set('offline', 'Connection lost', false));
        socket.io.on('reconnect_attempt', () => set('reconnecting', 'Reconnecting', false));

        return badge;
    }

    /* ── Screen wake lock ────────────────────────────────────
       Display machines otherwise sleep partway through a session.
       Needs https (or localhost); silently unavailable elsewhere. */

    function keepAwake() {
        if (!('wakeLock' in navigator)) return;
        let lock = null;

        async function request() {
            if (document.visibilityState !== 'visible') return;
            try {
                lock = await navigator.wakeLock.request('screen');
                lock.addEventListener('release', () => { lock = null; });
            } catch (e) {
                /* Denied or unsupported — nothing to do but carry on. */
            }
        }

        request();
        // The lock is dropped whenever the tab is hidden, so re-take it.
        document.addEventListener('visibilitychange', () => { if (!lock) request(); });
    }

    /* ── Fullscreen ──────────────────────────────────────────── */

    const Fullscreen = {
        active() { return !!document.fullscreenElement; },
        toggle() {
            if (Fullscreen.active()) document.exitFullscreen();
            else document.documentElement.requestFullscreen().catch(() => {});
        }
    };

    /* ── Auto-hiding chrome ──────────────────────────────────
       Anything marked .chrome fades out after a period of stillness,
       so a wall display settles into just the timer. */

    function autoHideChrome(delay) {
        let timer = null;

        function show() {
            document.body.classList.remove('chrome-hidden');
            clearTimeout(timer);
            timer = setTimeout(() => document.body.classList.add('chrome-hidden'), delay || 4000);
        }

        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach((evt) => {
            global.addEventListener(evt, show, { passive: true });
        });

        show();
        return show;
    }

    const prefersReducedMotion = () =>
        global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    global.TimerApp = {
        TIMER_IDS,
        Theme,
        Fullscreen,
        formatClock,
        createStore,
        mountConnection,
        keepAwake,
        autoHideChrome,
        prefersReducedMotion
    };
})(window);
