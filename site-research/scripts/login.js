'use strict';

/**
 * One-time (or as-needed) manual login helper.
 *
 * Launches a visible Chromium window using a persistent user-data-dir stored
 * in ../browser-profile. Log in normally in that window. When you close the
 * window (or press Ctrl+C here), the session/cookies are saved to disk in
 * that profile directory and will be reused by scripts/capture.js without
 * requiring another login, until the site session actually expires.
 *
 * No credentials are ever read, typed, or stored by this script itself -
 * you type your own login into the real page.
 */

const path = require('path');
const { chromium } = require('playwright');

const PROFILE_DIR = path.join(__dirname, '..', 'browser-profile');
const START_URL = 'https://pvzhtbot.com/dashboard';

async function main() {
  console.log('Launching browser with persistent profile at:', PROFILE_DIR);
  console.log('Log in normally in the window that opens.');
  console.log('When done, just close the browser window (or Ctrl+C here) - your session will be saved.');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());

  // Hard safety timeout: don't let this run forever unattended.
  const MAX_MS = 15 * 60 * 1000; // 15 minutes
  const timer = setTimeout(async () => {
    console.log('\n[timeout] 15 minutes elapsed, closing browser automatically.');
    try {
      await context.close();
    } catch {}
    process.exit(0);
  }, MAX_MS);
  timer.unref();

  await page.goto(START_URL, { timeout: 30000 }).catch((err) => {
    console.warn('Initial navigation warning:', err.message);
  });

  console.log('Waiting for you to finish logging in and close the window...');

  await new Promise((resolve) => {
    context.on('close', resolve);
    process.on('SIGINT', async () => {
      console.log('\n[Ctrl+C] Closing browser...');
      try {
        await context.close();
      } catch {}
      resolve();
    });
  });

  console.log('Session saved to browser-profile/. You can now run: npm run capture');
}

main().catch((err) => {
  console.error('login.js failed:', err);
  process.exit(1);
});
