# beads-ui

A web interface for the [**Beads**](https://github.com/gastownhall/beads) issue tracker. Browse, create, and manage issues in your browser — with live AI agent execution streamed from Claude Code, Cursor, or your own CLI tools.

## How it works

**beads-ui** is just a UI layer. It shells out to the `bd` CLI — the same one you use from the terminal — to list, create, update, and close issues. It doesn't replace Beads, it wraps it in a browser.

```
You ──→ beads-ui (browser) ──→ bd CLI ──→ Beads Dolt database
                                    ↑
                              (must be installed)
```

## Do I need to install Beads separately?

**Yes.** `bd` (the Beads CLI) is a **separate external tool** that must be installed on your system. beads-ui does not ship with it.

Install it if you haven't already:

```bash
brew install beads          # macOS / Linux (recommended)
npm install -g @beads/bd    # Node.js
```

Then initialize it in your project:

```bash
cd your-project
bd init
```

Verify it works:

```bash
bd list --json
```

Now beads-ui can talk to it.

## Quickstart

```bash
npx github:arthuracrs/beads-ui
```

Run that inside any Beads-tracked project directory. It finds a free port, starts the server, and opens a browser tab.

Or install globally:

```bash
npm install -g github:arthuracrs/beads-ui
beads-ui
```

## Features

- **Issue board** — list and Kanban views with filtering by status, type, priority, and text search
- **Issue detail panel** — view, comment, claim, close, reopen, and manage dependencies
- **Agent execution** — run Claude Code, Cursor, or tmux against any issue and stream output live in the UI
- **Custom runtimes** — define your own agent CLIs with `{prompt}` interpolation
- **Auto-refresh** — polls every 5 seconds so CLI-driven changes appear without manual reload
- **Init flow** — detects uninitialized workspaces and offers one-click `bd init`

## Development

```bash
git clone <repo>
cd beads-ui
npm install
npm run dev
```

Runs Vite dev server on port 5173 and Express API on port 3001.

## Configuration

| Env var | What it does |
|---|---|
| `PROJECT_DIR` | Path to the project with the `.beads/` database (default: cwd) |
| `BD_PATH` | Path to the `bd` binary (default: auto-detect on `$PATH`) |
| `PORT` | HTTP port for the Express server (default: 3001) |

### Custom agent runtimes

Add entries to `~/.config/beads-ui/runtimes.json`:

```json
[
  {
    "id": "my-agent",
    "name": "My Agent",
    "commandTemplate": "my-agent run {prompt}",
    "builtin": false
  }
]
```

`{prompt}` is replaced with a shell-quoted string containing issue context + your prompt.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS v4 |
| Backend | Express 5, TypeScript |
| Data | `bd` CLI / `.beads/issues.jsonl` fallback |
| Streaming | Server-Sent Events (SSE) |

## License

ISC
