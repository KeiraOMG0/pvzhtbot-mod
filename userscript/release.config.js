// Single source of truth for where Greenhouse is published and served.
// build.js injects these into the bundle at build time (as
// __GREENHOUSE_URLS__, see build.js `define`) and writes them into the
// userscript header; dev-server.js reads DEV_PORT. Nothing under src/
// hard-codes a GitHub or localhost URL - rename the repo/branch/file here
// and rebuild.

export const GITHUB_REPO = 'KeiraOMG0/pvzhtbot-mod';
export const RELEASE_BRANCH = 'master';
export const DIST_PATH = 'userscript/dist';
export const SCRIPT_FILE = 'pvzhtbot-mod.user.js';
export const META_FILE = 'pvzhtbot-mod.meta.js';
export const BUILD_ID_FILE = 'build-id.txt';
export const DEV_PORT = 8787;

const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${RELEASE_BRANCH}/${DIST_PATH}`;

export const URLS = Object.freeze({
  repo: `https://github.com/${GITHUB_REPO}`,
  install: `${RAW_BASE}/${SCRIPT_FILE}`, // @downloadURL + "Update now"
  meta: `${RAW_BASE}/${META_FILE}`, // @updateURL (header only, polled by Tampermonkey)
  buildId: `${RAW_BASE}/${BUILD_ID_FILE}`, // polled by update-checker
  devServer: `http://127.0.0.1:${DEV_PORT}`, // dev builds only
});
