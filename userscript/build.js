// Bundles src/core/loader.js (and everything it imports) into a single
// IIFE, then prepends the Tampermonkey userscript header, producing
// dist/pvzhtbot-mod.user.js — the file you actually install in
// Tampermonkey.

import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

// ---- Auto-update ----
// Tampermonkey only installs an update when @version goes UP, so the
// build stamps it: "<package.json version>.<UTC yyyymmddhhmm>", e.g.
// 0.3.0.202611032015. Every pushed build is therefore newer than the
// last one with no manual bump needed (bump package.json for real
// releases; the date suffix keeps ordering correct either way).
//
// @updateURL points at a tiny header-only dist/*.meta.js, which is what
// Tampermonkey polls; it only downloads the full @downloadURL script when
// the meta version is newer.
const RAW_BASE = 'https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist';
const SCRIPT_FILE = 'pvzhtbot-mod.user.js';
const META_FILE = 'pvzhtbot-mod.meta.js';

function stampVersion(buildId) {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const d = new Date(Number(buildId));
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  return `${pkg.version}.${stamp}`;
}

function renderHeader(version) {
  const template = readFileSync(path.join(__dirname, 'userscript-header.js'), 'utf8');
  const setTag = (src, tag, value) => {
    const re = new RegExp(`^(// @${tag}\\s+).*$`, 'm');
    if (!re.test(src)) throw new Error(`userscript-header.js is missing @${tag}`);
    return src.replace(re, `$1${value}`);
  };
  let header = setTag(template, 'version', version);
  header = setTag(header, 'updateURL', `${RAW_BASE}/${META_FILE}`);
  header = setTag(header, 'downloadURL', `${RAW_BASE}/${SCRIPT_FILE}`);
  return header.trimEnd();
}

function writeBundle(bundleCode) {
  const outDir = path.join(__dirname, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, SCRIPT_FILE);
  // BUILD_ID changes every rebuild so the dev server (and the page
  // polling it) can detect "there is a new version" without diffing file
  // contents; update-checker compares it against dist/build-id.txt on GitHub.
  const buildId = String(Date.now());
  const version = stampVersion(buildId);
  const header = renderHeader(version);
  writeFileSync(outPath, `${header}\nvar __PVZHTBOT_MOD_BUILD_ID__ = "${buildId}";\n${bundleCode}`, 'utf8');
  writeFileSync(path.join(outDir, META_FILE), `${header}\n`, 'utf8');
  writeFileSync(path.join(outDir, 'build-id.txt'), buildId, 'utf8');
  console.log(`Built ${outPath} (v${version}, build ${buildId}${watch ? ', DEV' : ''})`);
}

// archive/ holds retired plugins kept for history only (see
// archive/README.md). It's outside src/ so it's never bundled by
// default; this guard turns an accidental import of it into a hard build
// error instead of silently shipping dead code.
const ARCHIVE_DIR = path.join(__dirname, 'archive') + path.sep;
const blockArchiveImports = {
  name: 'block-archive-imports',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!args.resolveDir || !args.path.startsWith('.')) return undefined;
      const resolved = path.resolve(args.resolveDir, args.path);
      if (resolved.startsWith(ARCHIVE_DIR)) {
        return {
          errors: [{
            text: `"${args.importer}" imports from archive/ ("${args.path}"). Archived plugins are history only and must not be bundled - move it back into src/ to revive it.`,
          }],
        };
      }
      return undefined;
    });
  },
};

// Plugin auto-discovery, done at build time so everything is still one
// static bundle. `import plugins from 'greenhouse:plugins'` (in
// src/core/loader.js) resolves to a generated module that imports the
// default export of every src/plugins/<id>/index.js and
// src/userplugins/<id>/index.js. Folders starting with `_` or `.` are
// skipped (handy for WIP). Adding/removing a plugin folder triggers a
// rebuild in watch mode via watchDirs.
const PLUGIN_ROOTS = [
  { dir: path.join(__dirname, 'src', 'plugins'), builtIn: true },
  { dir: path.join(__dirname, 'src', 'userplugins'), builtIn: false },
];
const VIRTUAL_PLUGINS = 'greenhouse:plugins';

function discoverPlugins() {
  const found = [];
  for (const { dir, builtIn } of PLUGIN_ROOTS) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const indexPath = path.join(dir, entry.name, 'index.js');
      if (!existsSync(indexPath)) {
        console.warn(`[plugins] skipping ${path.relative(__dirname, path.join(dir, entry.name))}: no index.js`);
        continue;
      }
      found.push({ folder: entry.name, indexPath, builtIn });
    }
  }
  return found.sort((a, b) => a.folder.localeCompare(b.folder));
}

const autoPlugins = {
  name: 'greenhouse-auto-plugins',
  setup(build) {
    build.onResolve({ filter: new RegExp(`^${VIRTUAL_PLUGINS}$`) }, () => ({
      path: VIRTUAL_PLUGINS,
      namespace: 'greenhouse-virtual',
    }));
    build.onLoad({ filter: /.*/, namespace: 'greenhouse-virtual' }, () => {
      const plugins = discoverPlugins();
      const lines = plugins.map(
        (p, i) => `import p${i} from ${JSON.stringify(p.indexPath.split(path.sep).join('/'))};`
      );
      const entries = plugins.map(
        (p, i) => `  { plugin: p${i}, folder: ${JSON.stringify(p.folder)}, builtIn: ${p.builtIn} },`
      );
      console.log(`[plugins] discovered ${plugins.length}: ${plugins.map((p) => p.folder).join(', ')}`);
      return {
        contents: `${lines.join('\n')}\nexport default [\n${entries.join('\n')}\n];\n`,
        resolveDir: __dirname,
        loader: 'js',
        watchDirs: PLUGIN_ROOTS.map((r) => r.dir).filter((d) => existsSync(d)),
      };
    });
  },
};

const buildOptions = {
  entryPoints: [path.join(__dirname, 'src/core/loader.js')],
  bundle: true,
  format: 'iife',
  write: false,
  target: 'es2020',
  plugins: [blockArchiveImports, autoPlugins],
  // Dev builds (npm run dev) poll the local dev server for hot reload;
  // release builds (npm run build) compile that code out entirely, so
  // installed copies never hit 127.0.0.1 (which spams the console with
  // connection-refused errors when no dev server is running).
  define: { __GREENHOUSE_DEV__: watch ? 'true' : 'false' },
};

async function main() {
  if (!watch) {
    const result = await build(buildOptions);
    writeBundle(result.outputFiles[0].text);
    return;
  }

  const ctx = await context({
    ...buildOptions,
    plugins: [
      blockArchiveImports,
      autoPlugins,
      {
        name: 'write-userscript-bundle',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length) {
              console.error('Build failed:', result.errors);
              return;
            }
            writeBundle(result.outputFiles[0].text);
          });
        },
      },
    ],
  });

  await ctx.watch();
  console.log('Watching for changes in src/ ... (Ctrl+C to stop)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
