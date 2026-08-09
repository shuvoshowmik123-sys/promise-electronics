# Vercel config — read before editing `vercel.json`

## Never put comments in `vercel.json`

Vercel validates the file against a strict schema that rejects **any** property
it does not recognise, including one you invent to hold a comment. The whole
deployment is refused before a build starts:

```
The vercel.json schema validation failed with the following message:
should NOT have additional property `___comment_ignoreCommand`
```

JSON has no comment syntax. A `___comment_*` key is not a comment, it is an
unknown property.

This is not hypothetical. Commit `31e6b97` (2026-08-06) added an
`ignoreCommand` together with a `___comment_ignoreCommand` key explaining it.
Every frontend deploy from that moment on was rejected. Nothing about it was
loud: pushes succeeded, the backend kept deploying on its own hook, and the
site simply went on serving the bundle from before. It went unnoticed for
about two and a half days and nine commits, and was found only by comparing
the asset hash in the live HTML against a local build.

Explanations go here, in this file. `render.yaml` is YAML and *can* carry
comments — that is why the same mistake was never made there.

## What is in the file

- `buildCommand` / `outputDirectory` — Vite writes to `dist/public`.
- `rewrites` — `/api/*`, `/health` and `/ready` proxy to the Render backend;
  everything else falls through to `index.html` for the SPA router. The
  `(?!assets/)` guard keeps real bundle files from being rewritten to HTML.

## About `ignoreCommand`

There used to be one, to skip frontend builds on server-only commits. It was
removed along with the comment key, and it should be treated as **untested** if
anyone reinstates it: because the schema error rejected every deployment, that
command never actually ran on Vercel even once.

If it is reinstated, verify a deploy really happens afterwards — check that the
`/assets/index-*.js` hash in the live HTML matches a local `npx vite build`.
A green push is not evidence that anything shipped.
