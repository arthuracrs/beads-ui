import express from "express";
import cors from "cors";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs";
import { executionManager, tmuxManager, triggerStore } from "./executions";
import { runtimeRegistry } from "./runtimes";

const execAsync = promisify(exec);

// ── BdClient ──────────────────────────────────────────────────────────────────

class BdClient {
  private readonly bin: string;
  readonly projectDir: string;

  constructor() {
    const configured = process.env.BD_PATH || path.join(os.homedir(), ".local/bin/bd");
    this.bin = fs.existsSync(configured) ? `"${configured}"` : "bd";
    this.projectDir = process.env.PROJECT_DIR || process.cwd();
  }

  private buildEnv(): NodeJS.ProcessEnv {
    return { ...process.env, PATH: process.env.PATH } as NodeJS.ProcessEnv;
  }

  async run(args: string): Promise<string> {
    const { stdout } = await execAsync(`${this.bin} ${args}`, {
      env: this.buildEnv(),
      cwd: this.projectDir,
    });
    return stdout.trim();
  }

  async listIssues(): Promise<Record<string, unknown>[]> {
    try {
      const raw = await this.run("list --all -n 0 --json");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      const file = path.join(this.projectDir, ".beads/issues.jsonl");
      if (!fs.existsSync(file)) return [];
      return fs.readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((r) => r._type === "issue");
    }
  }

  isInitialized(): boolean {
    return fs.existsSync(path.join(this.projectDir, ".beads"));
  }

  async init(dir?: string): Promise<{ ok: boolean; output: string }> {
    const cwd = dir || this.projectDir;
    const { stdout } = await execAsync(`${this.bin} init`, {
      env: this.buildEnv(),
      cwd,
    });
    return { ok: true, output: stdout };
  }

  static parseJson<T>(raw: string): T {
    return JSON.parse(raw);
  }

  static unwrap<T>(parsed: unknown): T {
    return (Array.isArray(parsed) ? parsed[0] : parsed) as T;
  }

  static shQuote(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }

  static interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }
}

// ── MCP config bootstrap ──────────────────────────────────────────────────────

function mcpServerPath(): string {
  // Production: compiled mcp-session.js lands in dist-server/ alongside this file
  const sameDir = path.join(__dirname, "mcp-session.js");
  if (fs.existsSync(sameDir)) return sameDir;
  // Dev (tsx runner): __dirname = server/, dist-server is one level up
  const distDir = path.join(__dirname, "..", "dist-server", "mcp-session.js");
  if (fs.existsSync(distDir)) return distDir;
  // TypeScript source fallback (tsx from node_modules)
  return path.join(__dirname, "mcp-session.ts");
}

function ensureMcpConfig(projectDir: string): void {
  const mcpJsonPath = path.join(projectDir, ".mcp.json");
  let config: Record<string, unknown> = {};
  try {
    if (fs.existsSync(mcpJsonPath)) {
      config = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8")) as Record<string, unknown>;
    }
  } catch {
    // start fresh if file is corrupt
  }
  if (!config.mcpServers) config.mcpServers = {};
  const servers = config.mcpServers as Record<string, unknown>;

  const serverPath = mcpServerPath();
  const isTs = serverPath.endsWith(".ts");
  const command = isTs
    ? path.join(__dirname, "..", "node_modules", ".bin", "tsx")
    : process.execPath;

  servers["beads-session"] = { command, args: [serverPath] };

  try {
    fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`beads-session MCP registered in ${mcpJsonPath}`);
  } catch (err) {
    console.warn(`Warning: could not write .mcp.json: ${(err as Error).message}`);
  }
}

// ── App setup ─────────────────────────────────────────────────────────────────

const bd = new BdClient();
ensureMcpConfig(bd.projectDir);
const app = express();
app.use(cors());
app.use(express.json());

// GET /api/issues
app.get("/api/issues", async (req, res) => {
  try {
    const { status, type, priority, assignee, search } = req.query;
    let issues = await bd.listIssues();
    if (status) issues = issues.filter((i) => i.status === status);
    if (type) issues = issues.filter((i) => i.issue_type === type);
    if (priority !== undefined) issues = issues.filter((i) => String(i.priority) === String(priority));
    if (assignee) issues = issues.filter((i) => i.assignee === assignee);
    if (search) {
      const q = (search as string).toLowerCase();
      issues = issues.filter((i) =>
        String(i.title ?? "").toLowerCase().includes(q) ||
        String(i.description ?? "").toLowerCase().includes(q)
      );
    }
    res.json(issues);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/issues/ready
app.get("/api/issues/ready", async (_req, res) => {
  try {
    const raw = await bd.run("ready --json");
    const issues = raw ? BdClient.parseJson(raw) : [];
    res.json(issues);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/issues/stats
app.get("/api/issues/stats", async (_req, res) => {
  try {
    const raw = await bd.run("status --json");
    res.json(raw ? BdClient.parseJson(raw) : {});
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/issues/:id
app.get("/api/issues/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid issue id" });
  }
  try {
    const raw = await bd.run(`show ${id} --json`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const issue = Array.isArray(parsed) ? parsed[0] : parsed;
      if (issue) return res.json(issue);
    }
  } catch {
    // fall through to list fallback
  }
  try {
    const issues = await bd.listIssues();
    const issue = issues.find((i) => i.id === id);
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    res.json(issue);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
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
    const raw = await bd.run(args);
    res.json(BdClient.parseJson(raw));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// PATCH /api/issues/:id
app.patch("/api/issues/:id", async (req, res) => {
  try {
    const { status, priority, assignee, title } = req.body;
    let args = `update ${req.params.id} --json`;
    if (status) args += ` --status ${status}`;
    if (priority !== undefined) args += ` --priority ${priority}`;
    if (assignee !== undefined) args += ` --assignee "${assignee}"`;
    if (title) args += ` --title "${title.replace(/"/g, '\\"')}"`;
    const raw = await bd.run(args);
    res.json(BdClient.unwrap(BdClient.parseJson(raw)));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues/:id/claim
app.post("/api/issues/:id/claim", async (req, res) => {
  try {
    const raw = await bd.run(`update ${req.params.id} --claim --json`);
    res.json(BdClient.unwrap(BdClient.parseJson(raw)));
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
    const raw = await bd.run(`close ${req.params.id} ${r} --json`);
    res.json(BdClient.unwrap(BdClient.parseJson(raw)));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues/:id/reopen
app.post("/api/issues/:id/reopen", async (req, res) => {
  try {
    const raw = await bd.run(`reopen ${req.params.id} --json`);
    res.json(BdClient.unwrap(BdClient.parseJson(raw)));
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// POST /api/issues/:id/comment
app.post("/api/issues/:id/comment", async (req, res) => {
  try {
    const { body } = req.body;
    const raw = await bd.run(`comment ${req.params.id} "${body.replace(/"/g, '\\"')}" --json`);
    res.json(raw ? BdClient.parseJson(raw) : { ok: true });
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/issues/:id/deps
app.get("/api/issues/:id/deps", async (req, res) => {
  try {
    const raw = await bd.run(`dep list ${req.params.id} --json`);
    res.json(raw ? BdClient.parseJson(raw) : []);
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
    const raw = await bd.run(`dep add ${child} ${parent} ${t} --json`);
    res.json(raw ? BdClient.parseJson(raw) : { ok: true });
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/graph
app.get("/api/graph", async (_req, res) => {
  try {
    const raw = await bd.run("graph --json");
    res.json(raw ? BdClient.parseJson(raw) : {});
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// GET /api/init-status
app.get("/api/init-status", (_req, res) => {
  res.json({ initialized: bd.isInitialized() });
});

// POST /api/init
app.post("/api/init", async (req, res) => {
  try {
    const { dir } = req.body;
    const result = await bd.init(dir);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// ── Agent Runtimes ────────────────────────────────────────────────────────────

app.get("/api/runtimes", (_req, res) => {
  res.json(runtimeRegistry.list());
});

// ── Agent Executions ──────────────────────────────────────────────────────────

// GET /api/executions/issue/:issueId
app.get("/api/executions/issue/:issueId", (req, res) => {
  res.json(executionManager.getForIssue(req.params.issueId));
});

// POST /api/executions
app.post("/api/executions", async (req, res) => {
  const { issueId, runtimeId, prompt } = req.body as {
    issueId: string;
    runtimeId: string;
    prompt: string;
  };
  if (!issueId || !runtimeId || !prompt) {
    res.status(400).json({ error: "issueId, runtimeId, and prompt are required" });
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(issueId)) {
    res.status(400).json({ error: "Invalid issue id" });
    return;
  }
  const runtime = runtimeRegistry.get(runtimeId);
  if (!runtime) {
    res.status(400).json({ error: `Unknown runtime: ${runtimeId}` });
    return;
  }

  try {
    const issues = await bd.listIssues();
    const issue = issues.find((i) => i.id === issueId) as Record<string, unknown> | undefined;
    const vars: Record<string, string> = {
      id: issueId,
      title: String(issue?.title ?? ""),
      description: String(issue?.description ?? ""),
      status: String(issue?.status ?? ""),
      priority: String(issue?.priority ?? ""),
      type: String(issue?.issue_type ?? ""),
    };
    const resolvedPrompt = BdClient.interpolate(prompt, vars);
    let context = "";
    try {
      context = await bd.run(`show ${issueId}`);
    } catch {
      // If bd show fails, run anyway with just the user prompt.
    }
    const basePrompt = context
      ? `Issue context (output of \`bd show ${issueId}\`):\n\n${context}\n\n---\n\n${resolvedPrompt}`
      : resolvedPrompt;

    const finalPrompt = runtime.kind === "tmux"
      ? `${basePrompt}\n\n---\n\nWhen you have fully completed this task, call the \`end_session\` MCP tool to close this session and mark the work as done.`
      : basePrompt;

    const quotedPrompt = BdClient.shQuote(finalPrompt);

    const command = BdClient.interpolate(runtime.commandTemplate, { prompt: quotedPrompt });

    if (runtime.kind === "tmux") {
      const execution = executionManager.startTmux(issueId, command, "manual", bd.projectDir);
      res.json(execution);
    } else {
      const execution = executionManager.start(issueId, command, "manual", bd.projectDir);
      res.json(execution);
    }
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    res.status(500).json({ error: e.stderr || e.message });
  }
});

// DELETE /api/executions/:id  (cancel)
app.delete("/api/executions/:id", (req, res) => {
  console.log(`Received request to cancel execution ${req.params.id}`);
  const ok = executionManager.cancel(req.params.id);
  res.json({ ok });
});

// GET /api/executions/:id/stream  (SSE — live output)
app.get("/api/executions/:id/stream", (req, res) => {
  const execution = executionManager.get(req.params.id);
  if (!execution) {
    res.status(404).json({ error: "Execution not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.socket?.setNoDelay(true);

  const send = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    (res as unknown as { flush?: () => void }).flush?.();
  };

  if (execution.output) send({ type: "output", data: execution.output });

  if (execution.status !== "running") {
    send({ type: "done", status: execution.status, exitCode: execution.exitCode });
    res.end();
    return;
  }

  const unsub = executionManager.subscribe(req.params.id, (chunk, done, status, exitCode) => {
    if (chunk) send({ type: "output", data: chunk });
    if (done) {
      send({ type: "done", status, exitCode });
      res.end();
    }
  });

  req.on("close", unsub);
});

// ── Tmux sessions ─────────────────────────────────────────────────────────────

// GET /api/tmux/sessions — all tmux executions (global sessions screen)
app.get("/api/tmux/sessions", (_req, res) => {
  res.json(executionManager.getAllTmux());
});

// POST /api/tmux/sessions/:id/complete — agent signals task done (called by end_session MCP tool)
app.post("/api/tmux/sessions/:id/complete", (req, res) => {
  const ok = executionManager.completeTmux(req.params.id);
  res.json({ ok });
});

// DELETE /api/tmux/sessions/:id — user kills a session from the UI
app.delete("/api/tmux/sessions/:id", (req, res) => {
  const ok = executionManager.cancel(req.params.id);
  res.json({ ok });
});

// GET /api/executions/:id/pane  (SSE — polled tmux capture-pane output)
app.get("/api/executions/:id/pane", async (req, res) => {
  const execution = executionManager.get(req.params.id);
  if (!execution || !execution.tmuxSession) {
    res.status(404).json({ error: "Tmux execution not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.socket?.setNoDelay(true);

  const send = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    (res as unknown as { flush?: () => void }).flush?.();
  };

  const sessionName = execution.tmuxSession;

  // Send initial capture immediately
  const initial = await tmuxManager.capture(sessionName);
  if (initial) send({ type: "pane", data: initial });

  if (execution.status !== "running") {
    send({ type: "done", status: execution.status });
    res.end();
    return;
  }

  const interval = setInterval(async () => {
    const exec = executionManager.get(req.params.id)!;
    const paneData = await tmuxManager.capture(sessionName);
    if (paneData) send({ type: "pane", data: paneData });

    if (exec.status !== "running") {
      send({ type: "done", status: exec.status });
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on("close", () => clearInterval(interval));
});


// ── Triggers ──────────────────────────────────────────────────────────────────

// GET /api/triggers/issue/:issueId
app.get("/api/triggers/issue/:issueId", (req, res) => {
  res.json(triggerStore.getForIssue(req.params.issueId));
});

// POST /api/triggers
app.post("/api/triggers", (req, res) => {
  const trigger = triggerStore.create(req.body);
  res.json(trigger);
});

// PATCH /api/triggers/:id
app.patch("/api/triggers/:id", (req, res) => {
  const trigger = triggerStore.update(req.params.id, req.body);
  if (!trigger) { res.status(404).json({ error: "Trigger not found" }); return; }
  res.json(trigger);
});

// DELETE /api/triggers/:id
app.delete("/api/triggers/:id", (req, res) => {
  triggerStore.delete(req.params.id);
  res.json({ ok: true });
});

// ── Static (must be last) ─────────────────────────────────────────────────────

const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));
app.get("/*path", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`Beads UI: http://localhost:${PORT}`);
  console.log(`Project:  ${bd.projectDir}`);
});
