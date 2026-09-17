/* Which timers exist, and what they are called.
 *
 * The countdown itself stays in memory — a restart has always dropped a
 * running clock. What must survive is the set: a room's timer disappearing
 * from a wall because Azure recycled the app would be indistinguishable, to
 * the person in that room, from the app being broken.
 *
 * This module knows nothing about running clocks. Whether a timer is busy is
 * the server's business, and it says so by passing a predicate — which keeps
 * the rule about what may be deleted in one place instead of two.
 */
const fs = require('fs');
const path = require('path');

/* The permanent timers: the five the centre runs with. They are never
   removed, by hand or by tidying. Timers added beyond these are the ones the
   24-hour rule applies to. */
const BASE = Number(process.env.TIMER_BASE) || 5;
const MAX = Number(process.env.TIMER_MAX) || 9;

/* How many timers a brand-new installation starts with. Five are deployed
   today, so a first boot seeds five and nothing vanishes on deploy day; the
   two above the base are ordinary added timers from then on. */
const SEED = Math.min(MAX, Math.max(BASE, Number(process.env.TIMER_SEED) || 5));

const IDLE_MS = (Number(process.env.TIMER_IDLE_HOURS) || 24) * 60 * 60 * 1000;
const FLUSH_MS = 60 * 1000;

/* $HOME is persistent on App Service and survives a deploy; the deployed
   folder does not — a ZIP deploy replaces it wholesale. */
const DIR = process.env.TIMER_DATA_DIR
  || (process.env.HOME ? path.join(process.env.HOME, 'data') : path.join(__dirname, '..', 'data'));
const FILE = path.join(DIR, 'timers.json');

const now = () => new Date().toISOString();
const numberOf = (id) => Number(String(id).replace('timer-', ''));

let timers = [];
let dirty = false;
let flushTimer = null;

const defaultName = (n) => `Timer ${n}`;

function seed() {
  return Array.from({ length: SEED }, (_, i) => {
    const n = i + 1;
    return {
      id: `timer-${n}`,
      name: defaultName(n),
      base: n <= BASE,
      named: false,
      createdAt: now(),
      lastUsedAt: now(),
    };
  });
}

/* A row from disk, with anything missing or malformed replaced. Files are
   edited by hand sooner or later. */
function clean(row, index) {
  const n = numberOf(row && row.id);
  if (!Number.isInteger(n) || n < 1 || n > MAX) return null;

  return {
    id: `timer-${n}`,
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 80) : defaultName(n),
    base: n <= BASE,
    named: row.named === true,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : now(),
    lastUsedAt: typeof row.lastUsedAt === 'string' ? row.lastUsedAt : now(),
  };
}

function load() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch (err) {
    console.error('[timers] cannot create', DIR, '-', err.message);
  }

  let raw = null;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[timers] cannot read', FILE, '-', err.message);
  }

  if (raw === null) {
    timers = seed();
    save();
    console.log(`[timers] started a new list with ${timers.length} timers`);
    return list();
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    /* Keep it: it is the only record of what the timers were called, and a
       first flush would otherwise overwrite it. */
    const spoiled = FILE + '.bad';
    try { fs.renameSync(FILE, spoiled); } catch { /* best effort */ }
    console.error(`[timers] ${FILE} is unreadable (${err.message}); kept it as ${spoiled} and starting fresh`);
    timers = seed();
    save();
    return list();
  }

  const rows = Array.isArray(parsed && parsed.timers) ? parsed.timers : [];
  timers = rows.map(clean).filter(Boolean);

  /* The base timers always exist, whatever the file says. */
  for (let n = 1; n <= BASE; n += 1) {
    if (!timers.some((t) => t.id === `timer-${n}`)) {
      timers.push({ id: `timer-${n}`, name: defaultName(n), base: true, named: false, createdAt: now(), lastUsedAt: now() });
      dirty = true;
    }
  }

  /* Two rows claiming the same id: keep the first. */
  const seen = new Set();
  timers = timers.filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));

  sort();
  if (dirty) save();
  console.log(`[timers] loaded ${timers.length} timers from ${FILE}`);
  return list();
}

function sort() {
  timers.sort((a, b) => numberOf(a.id) - numberOf(b.id));
}

/* Written whole, to a temporary name, then renamed over — so a crash during a
   write cannot leave a half file that stops the app booting. On Linux App
   Service $HOME is an SMB mount where that is best-effort rather than atomic,
   which is still far better than writing in place. */
function save() {
  dirty = false;
  const body = JSON.stringify({ version: 1, timers }, null, 2);
  const temp = `${FILE}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(temp, body);
    fs.renameSync(temp, FILE);
  } catch (err) {
    console.error('[timers] could not save the list:', err.message);
    try { fs.unlinkSync(temp); } catch { /* nothing to clean up */ }
  }
}

/* lastUsedAt moves constantly — every command, and every display that is
   watching. Writing the file that often would be silly, and losing a minute of
   it costs nothing: at worst a timer survives an hour longer than it might. */
function flushSoon() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (dirty) save();
  }, FLUSH_MS);
  if (flushTimer.unref) flushTimer.unref();
}

const list = () => timers.map((t) => ({ ...t }));
const ids = () => timers.map((t) => t.id);
const has = (id) => timers.some((t) => t.id === id);
const get = (id) => timers.find((t) => t.id === id) || null;

function lowestFreeNumber() {
  for (let n = 1; n <= MAX; n += 1) {
    if (!has(`timer-${n}`)) return n;
  }
  return null;
}

/* A name the operator chose is what marks a timer as a room assignment rather
   than one somebody made by accident, and it is what keeps the sweep off it. */
function rename(id, name) {
  const timer = get(id);
  if (!timer) return null;

  const trimmed = String(name || '').trim().slice(0, 80);
  if (!trimmed) return timer;

  timer.name = trimmed;
  /* Any deliberate rename counts, whatever was typed. Deriving this from
     "the name differs from the default" would quietly un-name a timer when
     somebody types "Timer 6" back into the box. */
  timer.named = true;
  timer.lastUsedAt = now();
  save();
  return { ...timer };
}

function touch(id) {
  const timer = get(id);
  if (!timer) return;
  timer.lastUsedAt = now();
  flushSoon();
}

function create(name) {
  if (timers.length >= MAX) return { error: `There is a limit of ${MAX} timers.` };

  const n = lowestFreeNumber();
  if (n === null) return { error: `There is a limit of ${MAX} timers.` };

  const chosen = String(name || '').trim().slice(0, 80);
  const timer = {
    id: `timer-${n}`,
    name: chosen || defaultName(n),
    base: false,
    named: Boolean(chosen),
    createdAt: now(),
    lastUsedAt: now(),
  };

  timers.push(timer);
  sort();
  save();
  return { timer: { ...timer } };
}

function remove(id) {
  const timer = get(id);
  if (!timer) return { error: 'That timer no longer exists.' };
  if (timer.base) return { error: `${timer.name} is one of the permanent timers and cannot be removed.` };

  timers = timers.filter((t) => t.id !== id);
  save();
  return { removed: { ...timer } };
}

/* Unused, unwatched, and never named: a timer somebody made and forgot.
   Anything with a name is a room assignment and is left alone however long it
   sits — the cap already stops the strip growing without end, and taking a
   named room's timer off a wall over a quiet weekend is a far worse outcome
   than an extra tab. */
function sweep(isBusy) {
  const cutoff = Date.now() - IDLE_MS;
  const removed = [];

  for (const timer of [...timers]) {
    if (timer.base || timer.named) continue;
    if (isBusy(timer.id)) continue;
    if (Date.parse(timer.lastUsedAt) > cutoff) continue;

    timers = timers.filter((t) => t.id !== timer.id);
    removed.push({ ...timer });
    console.log(`[timers] removed ${timer.id} ("${timer.name}") — unnamed and unused since ${timer.lastUsedAt}`);
  }

  if (removed.length) save();
  return removed;
}

function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (dirty) save();
}

module.exports = {
  BASE, MAX, IDLE_MS, FILE,
  load, list, ids, has, get,
  create, remove, rename, touch, sweep, flush,
};
