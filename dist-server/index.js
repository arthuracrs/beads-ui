"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const Execs = __importStar(require("./executions"));
const Runtimes = __importStar(require("./runtimes"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const _bdConfigured = process.env.BD_PATH || path_1.default.join(os_1.default.homedir(), ".local/bin/bd");
const BD = fs_1.default.existsSync(_bdConfigured) ? `"${_bdConfigured}"` : "bd";
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
function buildEnv() {
    return { ...process.env, PATH: process.env.PATH };
}
async function bd(args) {
    const cmd = `${BD} ${args}`;
    const { stdout } = await execAsync(cmd, {
        env: buildEnv(),
        cwd: PROJECT_DIR,
    });
    return stdout.trim();
}
function parseJson(raw) {
    return JSON.parse(raw);
}
async function listIssues() {
    try {
        // --all: include closed; -n 0: no result cap (default is 50)
        const raw = await bd("list --all -n 0 --json");
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        // Fallback for JSONL-mode workspaces if bd CLI is unavailable
        const file = path_1.default.join(PROJECT_DIR, ".beads/issues.jsonl");
        if (!fs_1.default.existsSync(file))
            return [];
        return fs_1.default.readFileSync(file, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
            .filter((r) => r._type === "issue");
    }
}
// GET /api/issues
app.get("/api/issues", async (req, res) => {
    try {
        const { status, type, priority, assignee, search } = req.query;
        let issues = await listIssues();
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
        const raw = await bd("ready --json");
        const issues = raw ? parseJson(raw) : [];
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
        const raw = await bd("status --json");
        res.json(raw ? parseJson(raw) : {});
    }
    catch (err) {
        const e = err;
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
        // `bd show --json` includes comments; `bd list --json` does not.
        const raw = await bd(`show ${id} --json`);
        if (raw) {
            const parsed = JSON.parse(raw);
            const issue = Array.isArray(parsed) ? parsed[0] : parsed;
            if (issue)
                return res.json(issue);
        }
    }
    catch {
        // fall through to JSONL fallback
    }
    try {
        const issues = await listIssues();
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
        const raw = await bd(args);
        res.json(parseJson(raw));
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
function unwrap(parsed) {
    return (Array.isArray(parsed) ? parsed[0] : parsed);
}
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
        const raw = await bd(args);
        res.json(unwrap(parseJson(raw)));
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// POST /api/issues/:id/claim
app.post("/api/issues/:id/claim", async (req, res) => {
    try {
        const raw = await bd(`update ${req.params.id} --claim --json`);
        res.json(unwrap(parseJson(raw)));
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
        const raw = await bd(`close ${req.params.id} ${r} --json`);
        res.json(unwrap(parseJson(raw)));
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// POST /api/issues/:id/reopen
app.post("/api/issues/:id/reopen", async (req, res) => {
    try {
        const raw = await bd(`reopen ${req.params.id} --json`);
        res.json(unwrap(parseJson(raw)));
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
        const raw = await bd(`comment ${req.params.id} "${body.replace(/"/g, '\\"')}" --json`);
        res.json(raw ? parseJson(raw) : { ok: true });
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/issues/:id/deps
app.get("/api/issues/:id/deps", async (req, res) => {
    try {
        const raw = await bd(`dep list ${req.params.id} --json`);
        res.json(raw ? parseJson(raw) : []);
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
        const raw = await bd(`dep add ${child} ${parent} ${t} --json`);
        res.json(raw ? parseJson(raw) : { ok: true });
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/graph
app.get("/api/graph", async (_req, res) => {
    try {
        const raw = await bd("graph --json");
        res.json(raw ? parseJson(raw) : {});
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// GET /api/init-status — check if bd is initialized
// Detects both JSONL (.beads/issues.jsonl) and Dolt-backed (.beads/embeddeddolt/…) workspaces
app.get("/api/init-status", (_req, res) => {
    const initialized = fs_1.default.existsSync(path_1.default.join(PROJECT_DIR, ".beads"));
    res.json({ initialized });
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
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// ── Agent Runtimes ────────────────────────────────────────────────────────────
app.get("/api/runtimes", (_req, res) => {
    res.json(Runtimes.listRuntimes());
});
// ── Agent Executions ──────────────────────────────────────────────────────────
// GET /api/executions/issue/:issueId
app.get("/api/executions/issue/:issueId", (req, res) => {
    res.json(Execs.getExecutionsForIssue(req.params.issueId));
});
// POSIX shell-quote: wrap in single quotes and escape any embedded single quote.
function shQuote(s) {
    return "'" + s.replace(/'/g, "'\\''") + "'";
}
function interpolate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
// POST /api/executions
app.post("/api/executions", async (req, res) => {
    const { issueId, runtimeId, prompt } = req.body;
    if (!issueId || !runtimeId || !prompt) {
        res.status(400).json({ error: "issueId, runtimeId, and prompt are required" });
        return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(issueId)) {
        res.status(400).json({ error: "Invalid issue id" });
        return;
    }
    const runtime = Runtimes.getRuntime(runtimeId);
    if (!runtime) {
        res.status(400).json({ error: `Unknown runtime: ${runtimeId}` });
        return;
    }
    try {
        // Pull issue fields for {var} interpolation, then prepend `bd show` output
        // so the agent always has full issue context (description + comments + deps).
        const issues = await listIssues();
        const issue = issues.find((i) => i.id === issueId);
        const vars = {
            id: issueId,
            title: String(issue?.title ?? ""),
            description: String(issue?.description ?? ""),
            status: String(issue?.status ?? ""),
            priority: String(issue?.priority ?? ""),
            type: String(issue?.issue_type ?? ""),
        };
        const resolvedPrompt = interpolate(prompt, vars);
        let context = "";
        try {
            context = await bd(`show ${issueId}`);
        }
        catch {
            // If bd show fails, run anyway with just the user prompt.
        }
        const finalPrompt = context
            ? `Issue context (output of \`bd show ${issueId}\`):\n\n${context}\n\n---\n\n${resolvedPrompt}`
            : resolvedPrompt;
        const command = interpolate(runtime.commandTemplate, { prompt: shQuote(finalPrompt) });
        const execution = Execs.startExecution(issueId, command, "manual", PROJECT_DIR);
        res.json(execution);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ error: e.stderr || e.message });
    }
});
// DELETE /api/executions/:id  (cancel)
app.delete("/api/executions/:id", (req, res) => {
    const ok = Execs.cancelExecution(req.params.id);
    res.json({ ok });
});
// GET /api/executions/:id/stream  (SSE — live output)
app.get("/api/executions/:id/stream", (req, res) => {
    const execution = Execs.getExecution(req.params.id);
    if (!execution) {
        res.status(404).json({ error: "Execution not found" });
        return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx/proxy buffering
    res.flushHeaders();
    // Disable Nagle's algorithm so small SSE packets aren't batched
    res.socket?.setNoDelay(true);
    const send = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        res.flush?.();
    };
    // Replay existing output first
    if (execution.output)
        send({ type: "output", data: execution.output });
    // If already finished, close immediately
    if (execution.status !== "running") {
        send({ type: "done", status: execution.status, exitCode: execution.exitCode });
        res.end();
        return;
    }
    const unsub = Execs.subscribeToExecution(req.params.id, (chunk, done, status, exitCode) => {
        if (chunk)
            send({ type: "output", data: chunk });
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
    res.json(Execs.getTriggersForIssue(req.params.issueId));
});
// POST /api/triggers
app.post("/api/triggers", (req, res) => {
    const trigger = Execs.createTrigger(req.body);
    res.json(trigger);
});
// PATCH /api/triggers/:id
app.patch("/api/triggers/:id", (req, res) => {
    const trigger = Execs.updateTrigger(req.params.id, req.body);
    if (!trigger) {
        res.status(404).json({ error: "Trigger not found" });
        return;
    }
    res.json(trigger);
});
// DELETE /api/triggers/:id
app.delete("/api/triggers/:id", (req, res) => {
    Execs.deleteTrigger(req.params.id);
    res.json({ ok: true });
});
// ── Static (must be last) ─────────────────────────────────────────────────────
// Serve built React app (production mode)
const distPath = path_1.default.join(__dirname, "../dist");
app.use(express_1.default.static(distPath));
app.get("/*path", (_req, res) => {
    res.sendFile(path_1.default.join(distPath, "index.html"));
});
const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
    console.log(`Beads UI: http://localhost:${PORT}`);
    console.log(`Project:  ${PROJECT_DIR}`);
});
