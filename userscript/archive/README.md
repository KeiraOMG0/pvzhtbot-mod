# archive/

Plugins that are obsolete — the site added the feature natively, an
endpoint they relied on disappeared, or they were replaced by something
better — but are worth keeping around as history and reference.

**Nothing in this folder is ever compiled into the userscript.** It lives
outside `src/`, so esbuild never sees it, and `build.js` hard-fails the
build if anything under `src/` tries to import from here (so an archived
plugin can't sneak back into the bundle by accident).

Archived code is frozen as it was: its relative imports (`../../api/...`
etc.) will point at the wrong place now, and the APIs it called may no
longer exist. That's expected — it's a record, not runnable code. If you
want to revive one, move it back into `src/plugins/` and fix it up.

## Layout

```
archive/
├── README.md
└── <plugin-id>/
    ├── ARCHIVED.md        <- required: why/when it was retired (template below)
    └── index.js           <- the plugin exactly as it was when last working
        ...                <- any other files it had
```

## How to archive a plugin

1. `git mv userscript/src/plugins/<id> userscript/archive/<id>`
   (or `src/userplugins/<id>` for a user plugin) — `git mv` keeps its
   history attached. Plugins are auto-discovered from `src/`, so moving
   the folder out is all it takes to unregister it.
2. Add `archive/<id>/ARCHIVED.md` from the template below.
3. Add a row to the index table at the bottom of this file.
4. `npm run build` — fails loudly if another plugin still imports it.

Users who had it enabled keep a stale on/off flag in their Tampermonkey
storage; that's harmless (the plugin manager ignores IDs that aren't
registered).

### ARCHIVED.md template

```md
# <Plugin Name> (`<plugin-id>`)

- **Archived:** YYYY-MM-DD
- **Last working build:** <build id from dist/build-id.txt, or commit hash>
- **Reason:** superseded by site feature / endpoint removed / replaced by <other plugin> / ...

## What it did
One or two lines.

## Why it's obsolete
What changed (link the site-research doc or commit if there is one).

## Anything worth salvaging
Helpers, parsing tricks, or API knowledge another plugin could reuse.
```

## Index

| Plugin | Archived | Reason |
|---|---|---|
| _(none yet)_ | | |
