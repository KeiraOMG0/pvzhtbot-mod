'use strict';

/**
 * Discovery capture session.
 *
 * Reuses the persistent browser profile saved by scripts/login.js (so you
 * should already be logged in - if not, run `npm run login` first).
 *
 * This script:
 *  - opens a visible browser window on the persistent profile
 *  - attaches request/response logging scoped to *.pvzhtbot.com only
 *  - redacts cookies/auth headers/tokens/passwords before anything touches disk
 *  - navigates to a small set of known pages (dashboard, card-manager, profile)
 *  - then WAITS for you to click around normally (or for me to drive it in a
 *    later turn) - it does not perform bulk or destructive actions itself
 *
 * Safety:
 *  - Ctrl+C at any time cleanly closes the browser and flushes the capture file.
 *  - Hard wall-clock timeout (default 20 min) auto-closes an unattended session.
 *  - Per-request navigation/action timeouts prevent a hung page from hanging the script.
 *  - Capture is capped at 500 events per run (see lib/capture-logger.js).
 *  - Only same-site (*.pvzhtbot.com) XHR/fetch/document traffic is logged; third-party
 *    requests (analytics, ads, CDNs) are ignored entirely.
 */

const path = require('path');
const { chromium } = require('playwright');
const { CaptureLogger } = require('./lib/capture-logger');

const PROFILE_DIR = path.join(__dirname, '..', 'browser-profile');
const CAPTURES_DIR = path.join(__dirname, '..', 'captures');
const NAV_TIMEOUT_MS = 20000;
const MAX_SESSION_MS = 20 * 60 * 1000; // 20 minutes hard cap, unattended-run guard

const START_PAGES = [
  'https://pvzhtbot.com/',
  'https://pvzhtbot.com/dashboard',
  'https://pvzhtbot.com/dashboard/card-manager',
  'https://pvzhtbot.com/profile/keiraomg0',
];

async function main() {
  const logger = new CaptureLogger(CAPTURES_DIR);
  console.log('Capture file:', logger.filePath);
  console.log('Using profile:', PROFILE_DIR);
  console.log('Press Ctrl+C at any time to stop immediately (kill switch).');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(NAV_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  let stopped = false;
  const stop = async (reason) => {
    if (stopped) return;
    stopped = true;
    console.log(`\n[stop] ${reason}. Closing browser and flushing capture...`);
    try {
      await context.close();
    } catch {}
    console.log('Done. Capture saved to:', logger.filePath);
    process.exit(0);
  };

  process.on('SIGINT', () => stop('Ctrl+C received (kill switch)'));

  const hardTimer = setTimeout(() => stop(`hard session timeout (${MAX_SESSION_MS / 60000} min) reached`), MAX_SESSION_MS);
  hardTimer.unref();

  const page = context.pages()[0] || (await context.newPage());
  logger.attach(page);

  // Also attach to any additional tabs/popups the site opens.
  context.on('page', (p) => logger.attach(p));

  for (const url of START_PAGES) {
    if (stopped) break;
    console.log('Navigating to', url);
    try {
      await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'load' });
      await page.waitForTimeout(1500); // let async XHRs on load fire and get logged
    } catch (err) {
      console.warn(`  navigation warning for ${url}:`, err.message);
    }
  }

  console.log('\n=== Initial page loads captured. ===');
  console.log('The browser window is now yours (or mine, in a later controlled turn) to interact with normally:');
  console.log('  - view profile');
  console.log('  - open card manager / card collection, and page through it');
  console.log('  - add ONE card to a profile (single, non-bulk action) if you want that flow captured');
  console.log('  - remove ONE card from a profile if you want that flow captured');
  console.log('  - trigger a deliberate error (e.g. reload with a bad param) to capture error responses');
  console.log('This script will keep logging in the background until you Ctrl+C or the timeout hits.');
  console.log(`Session will auto-stop after ${MAX_SESSION_MS / 60000} minutes if left unattended.`);

  // Idle-wait: just keep the process alive so logging continues while a human
  // (or a controlled follow-up automation turn) drives the browser.
  await new Promise((resolve) => {
    context.on('close', resolve);
  });

  await stop('browser window closed');
}

main().catch((err) => {
  console.error('capture.js failed:', err);
  process.exit(1);
});
