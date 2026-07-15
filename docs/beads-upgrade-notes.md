# Beads Upgrade Notes

## Current: v1.1.0 (Homebrew) — upgraded 2026-07-15
## Previous: v1.0.3 (script install)

### Upgrade path used

1. Backed up DB: `bd export --all -o backup.jsonl`
2. Installed via Homebrew: `brew install beads`
3. Removed old binary at `~/.local/bin/bd` (was shadowing brew's version)
4. Migration ran automatically on next `bd` command (embedded Dolt, no remote)

### New features available from v1.1.0

| Feature | Command |
|---|---|
| Work leases (claim TTL + heartbeat) | `bd heartbeat <id>`, `bd reclaim --older-than <dur>` |
| Idempotent init | `bd init --init-if-missing` |
| Per-id close reasons | `bd close <id1>:<reason> <id2>:<reason>` |
| Recompute blocked state | `bd recompute-blocked` |
| Usage metrics | `bd metrics` (opt-out: `bd metrics off`) |

### Breaking changes from 1.0.3 → 1.1.0

- **JSONL auto-export is opt-in** — if you relied on `.beads/issues.jsonl` being auto-updated, set `export.auto: true` in `.beads/config.yaml`
- **Dependency `depends_on_id` is now a generated column** — code inserting dependencies must target `depends_on_issue_id`, `depends_on_wisp_id`, or `depends_on_external`, not the old poly column

### Things to watch in future upgrades

1. **Remote-backed DBs**: If this project ever switches to server mode with a Dolt remote, designate one machine to migrate and push, then have others run `bd bootstrap` — don't migrate independently on each clone.
2. **Back up first**: Always run `bd export --all -o backup.jsonl` before upgrading.
3. **Check `bd info --whats-new`**: After each upgrade, review what changed and whether config flags need updating.
4. **Hook compatibility**: If this project uses git hooks, run `bd hooks install` after upgrading.
5. **Brew vs script install**: Homebrew is the recommended install method. If switching methods, remove the old binary to avoid PATH shadowing.
