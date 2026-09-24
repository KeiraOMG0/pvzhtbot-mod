// Registry of user-authored plugins. Add one import + one array entry per
// plugin here - this is the ONLY file the core loader needs to know
// about, so dropping in a new userplugin never requires touching
// src/core/loader.js.
//
// Why a manifest instead of true auto-discovery: esbuild bundles
// statically (it needs to know every file at build time), so there's no
// way to "just drop a folder in and it works" without either a build-time
// directory scan or a runtime dynamic import - both add real complexity
// for a use case (a handful of user plugins) that doesn't need it yet.
// This manifest is the simplest thing that could work: explicit, greppable,
// and each entry is one line.
//
// Example:
//   import { myPlugin } from './my-plugin/index.js';
//   export const userPlugins = [myPlugin];

export const userPlugins = [];
