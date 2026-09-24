// Bundles src/core/loader.js (and everything it imports) into a single
// IIFE, then prepends the Tampermonkey userscript header, producing
// dist/pvzhtbot-mod.user.js — the file you actually install in
// Tampermonkey.

import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

function writeBundle(bundleCode) {
  const header = readFileSync(path.join(__dirname, 'userscript-header.js'), 'utf8');
  const outDir = path.join(__dirname, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'pvzhtbot-mod.user.js');
  // BUILD_ID changes every rebuild so the dev server (and the page
  // polling it) can detect "there is a new version" without diffing file
  // contents.
  const buildId = String(Date.now());
  writeFileSync(outPath, `${header}\nvar __PVZHTBOT_MOD_BUILD_ID__ = "${buildId}";\n${bundleCode}`, 'utf8');
  writeFileSync(path.join(outDir, 'build-id.txt'), buildId, 'utf8');
  console.log(`Built ${outPath} (build ${buildId})`);
}

const buildOptions = {
  entryPoints: [path.join(__dirname, 'src/core/loader.js')],
  bundle: true,
  format: 'iife',
  write: false,
  target: 'es2020',
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
