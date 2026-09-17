/* Who is driving.
 *
 * Displays are open to anyone and always will be: a wall panel must survive
 * everything, and there is nothing on it worth protecting. The controller and
 * the director are another matter — they drive every screen in the centre —
 * and until now their password was checked in the browser only. The server
 * told the page whether the password was right and then accepted commands
 * from any socket that asked, which meant the gate was decoration.
 *
 * So sign-in moves to the suite's shared accounts, which live in the overtime
 * tracker, and the session is a cookie this service signs itself. The cookie
 * is what Socket.IO reads on every handshake — notably including reconnects,
 * which is why a session survives an Azure recycle and a flaky room network
 * where a server-side "this socket authenticated" flag would not.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE = 'timer_session';

/* A controller lives on a desk for days at a time, so a working week rather
   than ERM's twelve hours: the alternative is an operator meeting a sign-in
   screen on a Thursday morning with a scenario about to start. Expiry is only
   ever felt at a reconnect, never mid-command. */
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 24 * 7;

/* The emergency way in is short on purpose. It is for getting through a
   session while something is broken, not for living on. */
const EMERGENCY_TTL_HOURS = Number(process.env.EMERGENCY_TTL_HOURS) || 4;

const api = () =>
  (process.env.TIMETRACKER_API_URL || 'https://timetracker-backend.azurewebsites.net').replace(/\/+$/, '');

/* Without a configured secret every restart would sign people out. That is
   tolerable in development and not in the centre, so it is loud. */
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!secret.fallback) {
    secret.fallback = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] SESSION_SECRET is not set — using a temporary one; every restart will sign people out');
  }
  return secret.fallback;
}

/* The centre's timer is needed mid-scenario, and the accounts live in another
   service. If that service is unreachable, this is the way in. Unset the
   setting to turn it off. */
const breakGlassPassword = () => process.env.CONTROLLER_PASSWORD || '';
const breakGlassOffered = () => Boolean(breakGlassPassword());

const matches = (offered, expected) => {
  const a = Buffer.from(String(offered));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const asUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.fullName || u.email,
  role: String(u.role || '').toLowerCase(),
});

/* Arriving from the hub already signed in. The code is single-use, expires in
   a minute, and is worth nothing without this service's own credential. */
async function redeemHandoff(code) {
  const key = process.env.TIMETRACKER_SERVICE_KEY;
  if (!key) {
    const error = new Error('TIMETRACKER_SERVICE_KEY is not configured');
    error.unavailable = true;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${api()}/auth/service/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': key },
      body: JSON.stringify({ code: String(code) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (cause) {
    const error = new Error('The sign-in service could not be reached');
    error.unavailable = true;
    error.cause = cause;
    throw error;
  }

  /* Expired, already spent, or minted for another application — one answer
     for all three. */
  if (response.status === 401) return null;

  if (!response.ok) {
    const error = new Error(`The sign-in service refused the request (${response.status})`);
    error.unavailable = true;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  return body && body.user ? asUser(body.user) : null;
}

const signSession = (user, via = 'hub') =>
  jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role, via }, secret(), {
    expiresIn: `${via === 'emergency' ? EMERGENCY_TTL_HOURS : TTL_HOURS}h`,
  });

/* SameSite=Lax, not None: everything the browser does here is same-site, and
   an arrival from the hub is a top-level navigation, which Lax allows. */
const sessionCookie = (token, hours = TTL_HOURS) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${hours * 3600}` +
  (process.env.NODE_ENV === 'production' ? '; Secure' : '');

const clearCookie = () =>
  `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` +
  (process.env.NODE_ENV === 'production' ? '; Secure' : '');

function readCookieHeader(header) {
  const raw = header || '';
  const match = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!match) return null;

  try {
    return jwt.verify(match.slice(COOKIE.length + 1), secret());
  } catch {
    return null; // expired, or tampered with
  }
}

/* Express and Socket.IO hand the headers over in the same shape. */
const readSession = (req) => readCookieHeader(req && req.headers && req.headers.cookie);

module.exports = {
  COOKIE,
  TTL_HOURS,
  EMERGENCY_TTL_HOURS,
  redeemHandoff,
  breakGlassOffered,
  breakGlassMatches: (password) => breakGlassOffered() && matches(password, breakGlassPassword()),
  signSession,
  sessionCookie,
  clearCookie,
  readSession,
};
