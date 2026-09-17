/* Puts the settings the controller's sign-in needs onto Azure.
 *
 *   node scripts/configure-azure.js --tracker   # register the timer as a client
 *   node scripts/configure-azure.js --timer     # give the timer its settings
 *
 * In two phases because each app-settings write recycles the worker, and the
 * two apps can afford that at different times: restarting the time tracker
 * costs a few seconds of payroll, while restarting the timer drops whatever
 * countdowns are running on the walls.
 *
 * Order matters. The tracker is told about the timer first; a timer that can
 * ask before the tracker will answer is a controller nobody can sign in to.
 *
 * Between the phases the generated values wait in a file, because they cannot
 * be regenerated — the tracker has already been given its half.
 *
 * Secrets are never printed. What reaches the terminal is a name and the first
 * twelve characters of a SHA-256, which is enough to check that two sides
 * match and no use to whoever reads the scrollback.
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TIMER = { name: 'bucies-timer', group: 'bucies-timer-rg' };
const TRACKER = { name: 'timetracker-backend', group: 'BUCIES' };
const HUB_URL = 'https://bucies.netlify.app';
const TRACKER_URL = 'https://timetracker-backend.azurewebsites.net';

const DOCS = path.join(os.homedir(), 'Documents');
const STAGED = path.join(DOCS, 'timer-azure-pending.json');
const PASSWORD_FILE = path.join(DOCS, 'timer-emergency-password.txt');

const az = (args) => {
  const result = spawnSync('az', args, { encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    console.error('az failed:', (result.stderr || '').slice(0, 400));
    process.exit(1);
  }
  return result.stdout.trim();
};

const fingerprint = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);

/* Sayable over the phone during an outage, and still hard to guess: somebody
   has to type this while a session waits. */
function passphrase() {
  const words = ['amber', 'anchor', 'bright', 'cedar', 'copper', 'ember', 'harbor', 'ivory',
    'jasper', 'lantern', 'meadow', 'onyx', 'quartz', 'ridge', 'saffron', 'timber',
    'velvet', 'willow', 'zenith', 'cobalt', 'marble', 'pepper', 'summit', 'tundra'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${pick()}-${crypto.randomInt(100, 1000)}`;
}

function registerWithTracker() {
  const current = az(['webapp', 'config', 'appsettings', 'list', '--name', TRACKER.name,
    '--resource-group', TRACKER.group, '--query', '"[?name==\'SERVICE_CLIENTS\'].value | [0]"', '-o', 'tsv']);

  if (!current) {
    console.error('the time tracker has no SERVICE_CLIENTS; refusing to guess');
    process.exit(1);
  }

  const ids = current.split(',').map((pair) => pair.split(':')[0].trim()).filter(Boolean);

  if (ids.includes('timer')) {
    console.log('The time tracker already knows a "timer" client.');
    console.log('Rotating it would invalidate whatever key the timer holds, so this leaves it alone.');
    console.log(fs.existsSync(STAGED)
      ? `The timer's half is still waiting in ${STAGED} — run with --timer.`
      : 'If the timer never got its half, remove the entry by hand and run this again.');
    return;
  }

  const timerSecret = crypto.randomBytes(32).toString('base64url');
  const pending = {
    created: new Date().toISOString(),
    SESSION_SECRET: crypto.randomBytes(32).toString('base64url'),
    TIMETRACKER_SERVICE_KEY: `timer.${timerSecret}`,
    TIMETRACKER_API_URL: TRACKER_URL,
    HUB_URL,
    CONTROLLER_PASSWORD: passphrase(),
  };

  az(['webapp', 'config', 'appsettings', 'set', '--name', TRACKER.name, '--resource-group', TRACKER.group,
    '--settings', JSON.stringify(`SERVICE_CLIENTS=${current},timer:${timerSecret}`), '-o', 'none']);

  fs.writeFileSync(STAGED, JSON.stringify(pending, null, 2));

  console.log(`time tracker: "timer" added, keeping ${ids.join(', ')} — one restart`);
  console.log(`  service key fingerprint  ${fingerprint(pending.TIMETRACKER_SERVICE_KEY)}`);
  console.log('');
  console.log(`The timer's settings are waiting in ${STAGED}.`);
  console.log('Run with --timer when a restart of the timer is affordable.');
  console.log('Until then the controller cannot sign anyone in — which is why nothing is deployed yet.');
}

function configureTimer() {
  if (!fs.existsSync(STAGED)) {
    console.error(`nothing staged at ${STAGED}; run with --tracker first`);
    process.exit(1);
  }

  const pending = JSON.parse(fs.readFileSync(STAGED, 'utf8'));
  const settings = ['SESSION_SECRET', 'TIMETRACKER_SERVICE_KEY', 'TIMETRACKER_API_URL', 'HUB_URL', 'CONTROLLER_PASSWORD']
    .map((key) => `${key}=${pending[key]}`);

  az(['webapp', 'config', 'appsettings', 'set', '--name', TIMER.name, '--resource-group', TIMER.group,
    '--settings', ...settings.map((s) => JSON.stringify(s)), '-o', 'none']);

  fs.writeFileSync(PASSWORD_FILE,
    `BUCIES Timer — emergency controller password\n` +
    `Set ${new Date().toISOString()}\n\n` +
    `${pending.CONTROLLER_PASSWORD}\n\n` +
    `This is the way into the timer controller when the hub or the account\n` +
    `service cannot be reached. The controller only offers it after a sign-in\n` +
    `has actually failed, and it lasts four hours.\n\n` +
    `Put it in the password manager and delete this file.\n` +
    `To turn the fallback off entirely, delete CONTROLLER_PASSWORD from the\n` +
    `timer's app settings.\n`);

  fs.rmSync(STAGED);

  console.log('timer: settings applied — one restart');
  console.log(`  service key fingerprint  ${fingerprint(pending.TIMETRACKER_SERVICE_KEY)}`);
  console.log(`  session secret           ${fingerprint(pending.SESSION_SECRET)}`);
  console.log('');
  console.log(`The emergency password is in ${PASSWORD_FILE} — move it to the password`);
  console.log('manager and delete that file. The staged file has been removed.');
}

if (process.argv.includes('--tracker')) registerWithTracker();
else if (process.argv.includes('--timer')) configureTimer();
else {
  console.log('node scripts/configure-azure.js --tracker   register the timer as a service client');
  console.log('node scripts/configure-azure.js --timer     give the timer its settings (restarts it)');
}
