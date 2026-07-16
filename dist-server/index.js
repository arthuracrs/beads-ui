"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const executions_1 = require("./executions");
const runtimes_1 = require("./runtimes");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ── BdClient ──────────────────────────────────────────────────────────────────
class BdClient {
    constructor() {
        const configured = process.env.BD_PATH || path_1.default.join(os_1.default.homedir(), ".local/bin/bd");
        this.bin = fs_1.default.existsSync(configured) ? `"${configured}"` : "bd";
        this.projectDir = process.env.PROJECT_DIR || process.cwd();
    }
    buildEnv() {
        return { ...process.env, PATH: process.env.PATH };
    }
    async run(args) {
        const { stdout } = await execAsync(`${this.bin} ${args}`, {
            env: this.buildEnv(),
            cwd: this.projectDir,
        });
        return stdout.trim();
    }
    async listIssues() {
        try {
            const raw = await this.run("list --all -n 0 --json");
            if (!raw)
                return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            const file = path_1.default.join(this.projectDir, ".beads/issues.jsonl");
            if (!fs_1.default.existsSync(file))
                return [];
            return fs_1.default.readFileSync(file, "utf8")
                .split("\n")
                .filter(Boolean)
                .map((line) => JSON.parse(line))
                .filter((r) => r._type === "issue");
        }
    }
    isInitialized() {
        return fs_1.default.existsSync(path_1.default.join(this.projectDir, ".beads"));
    }
    async init(dir) {
        const cwd = dir || this.projectDir;
        const { stdout } = await execAsync(`${this.bin} init`, {
            env: this.buildEnv(),
            cwd,
        });
        return { ok: true, output: stdout };
    }
    static interpolate(template, vars) {
        return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
    }
}
// ── App setup ─────────────────────────────────────────────────────────────────
const bd = new BdClient();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// GET /api/issues
app.get("/api/issues", async (req, res) => {
    try {
        const { status, type, priority, assignee, search } = req.query;
        let issues = await bd.listIssues();
        if (status)
            issues = issues.filter((i) => i.status === status);
        if (type)
            issues = issues.filter((i) => i.issue_type === type);
        if (priority !== undefined)
            issues = issues.filter((i) => String(i.priority) === String(priority));
        if (assignee)
            issues = issues.filter((i) => i.assignee === assignee);
        if (search) {
            const q = search.toLowerCase();
            issues = issues.filter((i) => String(i.title ?? "").toLowerCase().includes(q) ||
                String(i.description ?? "").toLowerCase().includes(q));
        }
        res.json(issues);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET /api/issues/ready
app.get("/api/issues/ready", async (_req, res) => {
    try {
        const raw = await bd.run("ready --json");
        const issues = raw ? JSON.parse(raw) : [];
        res.json(issues);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/issues/stats
app.get("/api/issues/stats", async (_req, res) => {
    try {
        const raw = await bd.run("status --json");
        res.json(raw ? JSON.parse(raw) : {});
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/issues/:id
app.get("/api/issues/:id", async (req, res) => {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
        return res.status(400).json({ error: "Invalid issue id" });
    }
    try {
        const raw = await bd.run(`show ${id} --json`);
        if (raw) {
            const parsed = JSON.parse(raw);
            const issue = Array.isArray(parsed) ? parsed[0] : parsed;
            if (issue)
                return res.json(issue);
        }
    }
    catch {
        // fall through to list fallback
    }
    try {
        const issues = await bd.listIssues();
        const issue = issues.find((i) => i.id === id);
        if (!issue)
            return res.status(404).json({ error: "Issue not found" });
        res.json(issue);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/issues
app.post("/api/issues", async (req, res) => {
    try {
        const { title, description, type, priority, assignee, label } = req.body;
        let args = `create "${title}" --json`;
        if (type)
            args += ` -t ${type}`;
        if (priority !== undefined)
            args += ` -p ${priority}`;
        if (description)
            args += ` -d "${description.replace(/"/g, '\\"')}"`;
        if (assignee)
            args += ` --assignee "${assignee}"`;
        if (label)
            args += ` --label "${label}"`;
        const raw = await bd.run(args);
        res.json(JSON.parse(raw));
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// PATCH /api/issues/:id
app.patch("/api/issues/:id", async (req, res) => {
    try {
        const { status, priority, assignee, title } = req.body;
        let args = `update ${req.params.id} --json`;
        if (status)
            args += ` --status ${status}`;
        if (priority !== undefined)
            args += ` --priority ${priority}`;
        if (assignee !== undefined)
            args += ` --assignee "${assignee}"`;
        if (title)
            args += ` --title "${title.replace(/"/g, '\\"')}"`;
        const raw = await bd.run(args);
        const parsed = JSON.parse(raw);
        res.json(Array.isArray(parsed) ? parsed[0] : parsed);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// POST /api/issues/:id/claim
app.post("/api/issues/:id/claim", async (req, res) => {
    try {
        const raw = await bd.run(`update ${req.params.id} --claim --json`);
        const parsed = JSON.parse(raw);
        res.json(Array.isArray(parsed) ? parsed[0] : parsed);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// POST /api/issues/:id/close
app.post("/api/issues/:id/close", async (req, res) => {
    try {
        const { reason } = req.body;
        const r = reason ? `--reason "${reason.replace(/"/g, '\\"')}"` : "";
        const raw = await bd.run(`close ${req.params.id} ${r} --json`);
        const parsed = JSON.parse(raw);
        res.json(Array.isArray(parsed) ? parsed[0] : parsed);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// POST /api/issues/:id/reopen
app.post("/api/issues/:id/reopen", async (req, res) => {
    try {
        const raw = await bd.run(`reopen ${req.params.id} --json`);
        res.json(JSON.parse(raw));
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/issues/:id/comments
app.get("/api/issues/:id/comments", async (req, res) => {
    try {
        const raw = await bd.run(`comments ${req.params.id} --json`);
        res.json(raw ? JSON.parse(raw) : []);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// POST /api/issues/:id/comment
app.post("/api/issues/:id/comment", async (req, res) => {
    try {
        const { body } = req.body;
        const raw = await bd.run(`comment ${req.params.id} "${body.replace(/"/g, '\\"')}" --json`);
        res.json(raw ? JSON.parse(raw) : { ok: true });
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/issues/:id/deps
app.get("/api/issues/:id/deps", async (req, res) => {
    try {
        const raw = await bd.run(`dep list ${req.params.id} --json`);
        res.json(raw ? JSON.parse(raw) : []);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// POST /api/deps
app.post("/api/deps", async (req, res) => {
    try {
        const { child, parent, type } = req.body;
        const t = type ? `--type ${type}` : "";
        const raw = await bd.run(`dep add ${child} ${parent} ${t} --json`);
        res.json(raw ? JSON.parse(raw) : { ok: true });
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/graph
app.get("/api/graph", async (_req, res) => {
    try {
        const raw = await bd.run("graph --json");
        res.json(raw ? JSON.parse(raw) : {});
    }
    catch (err) {
        const e = err;
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
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/formulas
app.get("/api/formulas", async (_req, res) => {
    try {
        const raw = await bd.run("formula list --json");
        const parsed = raw ? JSON.parse(raw) : null;
        res.json(Array.isArray(parsed) ? parsed : []);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/formulas/:name
app.get("/api/formulas/:name", async (req, res) => {
    const name = req.params.name;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ error: "Invalid formula name" });
    }
    try {
        const raw = await bd.run(`formula show ${name} --json`);
        res.json(raw ? JSON.parse(raw) : {});
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// ── Agent Runtimes ────────────────────────────────────────────────────────────
app.get("/api/runtimes", async (_req, res) => {
    try {
        const runtimes = await runtimes_1.runtimeRegistry.list();
        res.json(runtimes);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── Agent Executions ──────────────────────────────────────────────────────────
// GET /api/executions/issue/:issueId
app.get("/api/executions/issue/:issueId", (req, res) => {
    res.json(executions_1.executionManager.getForIssue(req.params.issueId));
});
// POST /api/executions
app.post("/api/executions", async (req, res) => {
    const { issueId, runtimeId, prompt, mode } = req.body;
    if (!issueId || !runtimeId || !prompt) {
        res.status(400).json({ error: "issueId, runtimeId, prompt are required" });
        return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(issueId)) {
        res.status(400).json({ error: "Invalid issue id" });
        return;
    }
    const runtime = await runtimes_1.runtimeRegistry.get(runtimeId);
    if (!runtime) {
        res.status(400).json({ error: `Unknown runtime: ${runtimeId}` });
        return;
    }
    const execMode = (mode || runtime.defaultMode);
    try {
        // Fetch issue context
        const issues = await bd.listIssues();
        const issue = issues.find((i) => i.id === issueId);
        // Interpolate prompt variables
        const vars = {
            id: issueId,
            title: String(issue?.title ?? ""),
            description: String(issue?.description ?? ""),
            status: String(issue?.status ?? ""),
            priority: String(issue?.priority ?? ""),
            type: String(issue?.issue_type ?? ""),
        };
        const resolvedPrompt = BdClient.interpolate(prompt, vars);
        // Fetch bd show context for system prompt
        let context = "";
        try {
            context = await bd.run(`show ${issueId}`);
        }
        catch {
            // Run without context if bd show fails
        }
        const systemPrompt = context
            ? `You are working on a beads issue.\n\nIssue context (bd show ${issueId}):\n\n${context}`
            : "You are working on a beads issue.";
        // Resolve anagent binary
        const localDist = path_1.default.join(__dirname, "../../anagent/dist/cli.js");
        const hasLocalAnagent = fs_1.default.existsSync(localDist);
        let bin;
        let useNpx = false;
        if (process.env.ANAGENT_PATH) {
            bin = process.env.ANAGENT_PATH;
        }
        else if (hasLocalAnagent) {
            bin = "node";
        }
        else {
            const PATH = process.env.PATH || "";
            let found = "";
            for (const dir of PATH.split(":")) {
                const candidate = path_1.default.join(dir, "anagent");
                if (fs_1.default.existsSync(candidate)) {
                    found = candidate;
                    break;
                }
            }
            if (found) {
                bin = found;
            }
            else {
                bin = "npx";
                useNpx = true;
            }
        }
        // Build anagent args
        const runtimeArgs = [
            "run", resolvedPrompt,
            execMode === "headless" ? "--stream" : "--json",
            "--runtime", runtimeId,
            "--mode", execMode,
            "--system-prompt", systemPrompt,
            "--cwd", bd.projectDir,
        ];
        let anagentArgs;
        if (useNpx) {
            anagentArgs = ["--yes", "github:arthuracrs/anagent", ...runtimeArgs];
        }
        else if (bin === "node") {
            anagentArgs = [localDist, ...runtimeArgs];
        }
        else {
            anagentArgs = runtimeArgs;
        }
        const execution = executions_1.executionManager.start(issueId, runtimeId, resolvedPrompt, execMode, systemPrompt, bd.projectDir, bin, anagentArgs, "manual");
        res.json(execution);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// DELETE /api/executions/:id (cancel)
app.delete("/api/executions/:id", (req, res) => {
    const ok = executions_1.executionManager.cancel(req.params.id);
    res.json({ ok });
});
// GET /api/executions/:id/stream (SSE — live output)
app.get("/api/executions/:id/stream", (req, res) => {
    const execution = executions_1.executionManager.get(req.params.id);
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
    const send = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        res.flush?.();
    };
    // If execution is already done, send stored events and done signal
    if (execution.output) {
        // Send stored output as text events
        for (const line of execution.output.split("\n")) {
            if (line.trim())
                send({ type: "text", delta: line + "\n" });
        }
    }
    if (execution.status !== "running") {
        send({ type: "done", status: execution.status, exitCode: execution.exitCode });
        res.end();
        return;
    }
    const unsub = executions_1.executionManager.subscribe(req.params.id, (event, done, status, exitCode) => {
        if (event)
            send(event);
        if (done) {
            send({ type: "done", status, exitCode });
            res.end();
        }
    });
    req.on("close", unsub);
});
// ── Triggers ──────────────────────────────────────────────────────────────────
// GET /api/triggers/issue/:issueId
app.get("/api/triggers/issue/:issueId", (req, res) => {
    res.json(executions_1.triggerStore.getForIssue(req.params.issueId));
});
// POST /api/triggers
app.post("/api/triggers", (req, res) => {
    const trigger = executions_1.triggerStore.create(req.body);
    res.json(trigger);
});
// PATCH /api/triggers/:id
app.patch("/api/triggers/:id", (req, res) => {
    const trigger = executions_1.triggerStore.update(req.params.id, req.body);
    if (!trigger) {
        res.status(404).json({ error: "Trigger not found" });
        return;
    }
    res.json(trigger);
});
// DELETE /api/triggers/:id
app.delete("/api/triggers/:id", (req, res) => {
    executions_1.triggerStore.delete(req.params.id);
    res.json({ ok: true });
});
// ── Static (must be last) ─────────────────────────────────────────────────────
const distPath = path_1.default.join(__dirname, "../dist");
app.use(express_1.default.static(distPath));
app.get("/*path", (_req, res) => {
    res.sendFile(path_1.default.join(distPath, "index.html"));
});
const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
    console.log(`Beads UI: http://localhost:${PORT}`);
    console.log(`Project:  ${bd.projectDir}`);
});
