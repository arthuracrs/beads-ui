import express from "express";
import cors from "cors";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execAsync = promisify(exec);
const app = express();
app.use(cors());
app.use(express.json());

const BD = process.env.BD_PATH || path.join(os.homedir(), ".local/bin/bd");
const BEADS_DIR = process.env.BEADS_DIR || "";
// PROJECT_DIR: the directory bd is run from (so it can discover .beads/)
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();

function buildEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: process.env.PATH };
  if (BEADS_DIR) env.BEADS_DIR = BEADS_DIR;
  return env;
}

async function bd(args: string): Promise<string> {
  const cmd = `"${BD}" ${args}`;
  const { stdout } = await execAsync(cmd, {
    env: buildEnv(),
    cwd: PROJECT_DIR,
  });
  return stdout.trim();
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw);
}

// GET /api/issues
app.get("/api/issues", async (req, res) => {
  try {
    const { status, type, priority, assignee, label, search } = req.query;
    let args = "list --json";
    if (status) args += ` --status ${status}`;
    if (type) args += ` --type ${type}`;
    if (priority !== undefined) args += ` --priority ${priority}`;
    if (assignee) args += ` --assignee "${assignee}"`;
    if (label) args += ` --label "${label}"`;
    if (search) args += ` --search "${search}"`;
    const raw = await bd(args);
    const issues = raw ? parseJson(raw) : [];
    res.json(issues);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/issues/ready
app.get("/api/issues/ready", async (_req, res) => {
  try {
    const raw = await bd("ready --json");
    const issues = raw ? parseJson(raw) : [];
    res.json(issues);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/issues/stats
app.get("/api/issues/stats", async (_req, res) => {
  try {
    const raw = await bd("status --json");
    res.json(raw ? parseJson(raw) : {});
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/issues/:id
app.get("/api/issues/:id", async (req, res) => {
  try {
    const raw = await bd(`show ${req.params.id} --json`);
    const parsed = parseJson<unknown>(raw);
    // bd show returns an array; extract the first element
    const issue = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    res.json(issue);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues
app.post("/api/issues", async (req, res) => {
  try {
    const { title, description, type, priority, assignee, label } = req.body;
    let args = `create "${title}" --json`;
    if (type) args += ` -t ${type}`;
    if (priority !== undefined) args += ` -p ${priority}`;
    if (description) args += ` -d "${description.replace(/"/g, '\\"')}"`;
    if (assignee) args += ` --assignee "${assignee}"`;
    if (label) args += ` --label "${label}"`;
    const raw = await bd(args);
    res.json(parseJson(raw));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

function unwrap<T>(parsed: unknown): T {
  return (Array.isArray(parsed) ? parsed[0] : parsed) as T;
}

// PATCH /api/issues/:id
app.patch("/api/issues/:id", async (req, res) => {
  try {
    const { status, priority, assignee, title } = req.body;
    let args = `update ${req.params.id} --json`;
    if (status) args += ` --status ${status}`;
    if (priority !== undefined) args += ` --priority ${priority}`;
    if (assignee !== undefined) args += ` --assignee "${assignee}"`;
    if (title) args += ` --title "${title.replace(/"/g, '\\"')}"`;
    const raw = await bd(args);
    res.json(unwrap(parseJson(raw)));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues/:id/claim
app.post("/api/issues/:id/claim", async (req, res) => {
  try {
    const raw = await bd(`update ${req.params.id} --claim --json`);
    res.json(unwrap(parseJson(raw)));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues/:id/close
app.post("/api/issues/:id/close", async (req, res) => {
  try {
    const { reason } = req.body;
    const r = reason ? `--reason "${reason.replace(/"/g, '\\"')}"` : "";
    const raw = await bd(`close ${req.params.id} ${r} --json`);
    res.json(unwrap(parseJson(raw)));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues/:id/reopen
app.post("/api/issues/:id/reopen", async (req, res) => {
  try {
    const raw = await bd(`reopen ${req.params.id} --json`);
    res.json(unwrap(parseJson(raw)));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues/:id/comment
app.post("/api/issues/:id/comment", async (req, res) => {
  try {
    const { body } = req.body;
    const raw = await bd(`comment ${req.params.id} "${body.replace(/"/g, '\\"')}" --json`);
    res.json(raw ? parseJson(raw) : { ok: true });
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/issues/:id/deps
app.get("/api/issues/:id/deps", async (req, res) => {
  try {
    const raw = await bd(`dep list ${req.params.id} --json`);
    res.json(raw ? parseJson(raw) : []);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/deps
app.post("/api/deps", async (req, res) => {
  try {
    const { child, parent, type } = req.body;
    const t = type ? `--type ${type}` : "";
    const raw = await bd(`dep add ${child} ${parent} ${t} --json`);
    res.json(raw ? parseJson(raw) : { ok: true });
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/graph
app.get("/api/graph", async (_req, res) => {
  try {
    const raw = await bd("graph --json");
    res.json(raw ? parseJson(raw) : {});
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/init-status — check if bd is initialized
app.get("/api/init-status", async (_req, res) => {
  try {
    await bd("status --json");
    res.json({ initialized: true });
  } catch {
    res.json({ initialized: false });
  }
});

// POST /api/init
app.post("/api/init", async (req, res) => {
  try {
    const { dir } = req.body;
    const cwd = dir || PROJECT_DIR;
    const { stdout } = await execAsync(`"${BD}" init`, {
      env: buildEnv(),
      cwd,
    });
    res.json({ ok: true, output: stdout });
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`Beads API server running on http://localhost:${PORT}`);
  console.log(`BD path: ${BD}`);
  console.log(`Project dir: ${PROJECT_DIR}`);
  if (BEADS_DIR) console.log(`BEADS_DIR: ${BEADS_DIR}`);
});
