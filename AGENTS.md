# AGENTS.md

## Installing beads-ui

When installing or updating `beads-ui` globally, use the GitHub archive URL, not the `github:` shorthand. npm's git dependency handler runs a `prepare` build step in a sandboxed clone where `node_modules/.bin` is not available, causing `vite: command not found` failures.

Correct:

```bash
npm install -g https://github.com/arthuracrs/beads-ui/archive/main.tar.gz
```

To update:

```bash
npm uninstall -g beads-ui && npm install -g https://github.com/arthuracrs/beads-ui/archive/main.tar.gz
```

Do not use `npm install -g github:arthuracrs/beads-ui` — it will fail during the `prepare` step.

## Releasing

Run `npm run build` locally before committing so the committed `dist/` and `dist-server/` are current. The archive URL install ships these prebuilt files directly — no build runs on the consumer's machine.
