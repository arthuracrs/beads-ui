# beads-ui

A web interface for the [Beads (`bd`)](https://github.com/steveyegge/beads) issue tracker. Browse, create, and manage issues in your browser, with live agent execution powered by Claude Code or Cursor.

## Features

- **Issue board** — list and Kanban views with filtering by status, type, priority, and free-text search
- **Issue detail panel** — view, comment, claim, close, reopen, and manage dependencies
- **Agent execution** — run Claude Code or Cursor against any issue and stream output live in the UI
- **Custom runtimes** — define your own agent CLI commands with `{prompt}` interpolation
- **Auto-refresh** — polls every 5 seconds so CLI-driven changes appear without a manual reload
- **Init flow** — detects uninitialized workspaces and offers a one-click `bd init`

## Requirements

- Node.js 18+
- [`bd` (Beads)](https://github.com/steveyegge/beads) installed and on `$PATH` (or at `~/.local/bin/bd`)

## Quickstart

### Via npx (no install required)

```bash
npx github:arthuracrs/beads-ui
```

Run this inside any Beads-tracked project directory. npx pulls the latest version directly from GitHub each time.

Or install globally:

```bash
npm install -g github:arthuracrs/beads-ui
beads-ui
```

The CLI finds a free port starting at 3001, starts the server in the current directory, and opens a browser tab automatically.

### From source

```bash
git clone <repo>
cd beads-ui
npm install
npm run dev        # Vite dev server (port 5173) + Express API (port 3001)
```

## Configuration

### Project directory

By default the server uses `cwd`. Override with:

```bash
PROJECT_DIR=/path/to/project beads-ui
```

### `bd` binary path

```bash
BD_PATH=/custom/path/to/bd beads-ui
```

### Port

```bash
PORT=4000 beads-ui
```

### Custom agent runtimes

Add entries to `~/.config/beads-ui/runtimes.json`:

```json
[
  {
    "id": "my-agent",
    "name": "My Agent",
    "description": "Custom agent CLI",
    "commandTemplate": "my-agent run {prompt}",
    "builtin": false
  }
]
```

`{prompt}` is replaced with a shell-quoted string containing the full issue context followed by your prompt. Built-in runtimes are `claude-code` and `cursor`.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Express 5, TypeScript (`tsx`) |
| Issue data | `bd` CLI / `.beads/issues.jsonl` fallback |
| Agent output | Server-Sent Events (SSE) |

## License

ISC
