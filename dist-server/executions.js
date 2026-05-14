"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionManager = exports.triggerStore = exports.ExecutionManager = exports.tmuxManager = exports.TmuxManager = exports.TriggerStore = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// ── Stream JSON parser ────────────────────────────────────────────────────────
class StreamJsonParser {
    constructor(onText) {
        this.onText = onText;
        this.buf = "";
        this.toolBlocks = new Map();
    }
    process(chunk) {
        this.buf += chunk;
        const lines = this.buf.split("\n");
        this.buf = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const text = this.handle(JSON.parse(trimmed));
                if (text)
                    this.onText(text);
            }
            catch {
                this.onText(trimmed + "\n");
            }
        }
    }
    handle(ev) {
        if (ev.type === "stream_event") {
            return this.handleStreamEvent(ev.event ?? {});
        }
        if (ev.type === "user") {
            const content = ev.message?.content ?? [];
            return content
                .filter((b) => b.type === "tool_result")
                .map((b) => {
                const blocks = (Array.isArray(b.content) ? b.content : [b.content]);
                const text = blocks.filter((c) => c?.type === "text").map((c) => c.text).join("").trim();
                if (!text)
                    return "";
                const truncated = text.length > 500 ? text.slice(0, 500) + "\n\x1b[2m…(truncated)\x1b[0m" : text;
                return `\x1b[2m${truncated}\x1b[0m\n`;
            })
                .join("");
        }
        if (ev.type === "result") {
            const cost = typeof ev.total_cost_usd === "number" ? ` · $${ev.total_cost_usd.toFixed(4)}` : "";
            return `\n\x1b[2m[done${cost}]\x1b[0m\n`;
        }
        return "";
    }
    handleStreamEvent(event) {
        const type = event.type;
        if (type === "content_block_start") {
            const block = event.content_block;
            if (block?.type === "tool_use") {
                this.toolBlocks.set(event.index, { name: block.name, inputJson: "" });
            }
            return "";
        }
        if (type === "content_block_delta") {
            const delta = event.delta;
            if (delta?.type === "text_delta")
                return delta.text ?? "";
            if (delta?.type === "input_json_delta") {
                const block = this.toolBlocks.get(event.index);
                if (block)
                    block.inputJson += delta.partial_json ?? "";
            }
            return "";
        }
        if (type === "content_block_stop") {
            const block = this.toolBlocks.get(event.index);
            if (block) {
                this.toolBlocks.delete(event.index);
                let input = {};
                try {
                    input = JSON.parse(block.inputJson || "{}");
                }
                catch { /* partial input */ }
                return `\n\x1b[36m▶ ${block.name}\x1b[0m ${StreamJsonParser.fmtToolInput(block.name, input)}\n`;
            }
            return "";
        }
        return "";
    }
    static fmtToolInput(name, input) {
        if (name === "Bash" && typeof input.command === "string") {
            const cmd = input.command.slice(0, 300);
            return `\`${cmd}${input.command.length > 300 ? "…" : ""}\``;
        }
        const s = JSON.stringify(input ?? {});
        return s.length > 200 ? s.slice(0, 200) + "…" : s;
    }
}
// ── Trigger store ─────────────────────────────────────────────────────────────
class TriggerStore {
    constructor() {
        this.triggers = new Map();
    }
    getForIssue(issueId) {
        return Array.from(this.triggers.values()).filter((t) => t.issueId === issueId);
    }
    getMatching(issueId, condition) {
        return Array.from(this.triggers.values()).filter((t) => t.issueId === issueId && t.enabled && t.condition === condition);
    }
    create(data) {
        const trigger = { ...data, id: TriggerStore.genId(), createdAt: new Date().toISOString() };
        this.triggers.set(trigger.id, trigger);
        return trigger;
    }
    update(id, patch) {
        const t = this.triggers.get(id);
        if (!t)
            return undefined;
        Object.assign(t, patch);
        return t;
    }
    delete(id) {
        return this.triggers.delete(id);
    }
    static genId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
}
exports.TriggerStore = TriggerStore;
// ── Tmux manager ─────────────────────────────────────────────────────────────
class TmuxManager {
    assertSafe(name) {
        if (!TmuxManager.VALID_NAME.test(name)) {
            throw new Error(`Unsafe tmux session name: ${name}`);
        }
    }
    sessionName(execId) {
        return `${TmuxManager.SESSION_PREFIX}${execId}`;
    }
    async start(execId, shellCommand, projectDir) {
        const name = this.sessionName(execId);
        this.assertSafe(name);
        const port = process.env.PORT ?? "3001";
        await execFileAsync("tmux", [
            "new-session", "-d",
            "-s", name,
            "-x", "220",
            "-y", "50",
            "-c", projectDir,
            "-e", "BEADS_ACTOR=agent",
            "-e", `BEADS_EXEC_ID=${execId}`,
            "-e", `BEADS_API_URL=http://localhost:${port}/api`,
            shellCommand,
        ]);
        // remain-on-exit keeps the pane visible after claude exits (crash, /exit, etc.)
        // so the user can see final output and the poller can detect the dead-pane status.
        await execFileAsync("tmux", ["set-option", "-t", name, "remain-on-exit", "on"]);
    }
    async capture(name, lines = 300) {
        this.assertSafe(name);
        try {
            const { stdout } = await execFileAsync("tmux", [
                "capture-pane", "-p", "-e", "-t", name, "-S", `-${lines}`,
            ]);
            // tmux pads every line to the pane width with spaces; trim them so xterm.js
            // doesn't re-wrap at the wrong column when the viewport is narrower.
            return stdout.split("\n").map((l) => l.trimEnd()).join("\n");
        }
        catch {
            return "";
        }
    }
    async kill(name) {
        this.assertSafe(name);
        try {
            await execFileAsync("tmux", ["kill-session", "-t", name]);
        }
        catch {
            // session may already be dead
        }
    }
    async hasSession(name) {
        this.assertSafe(name);
        try {
            await execFileAsync("tmux", ["has-session", "-t", `=${name}`]);
            return true;
        }
        catch {
            return false;
        }
    }
    async paneCommand(name) {
        this.assertSafe(name);
        try {
            const { stdout } = await execFileAsync("tmux", [
                "display-message", "-p", "-t", name, "#{pane_current_command}",
            ]);
            return stdout.trim();
        }
        catch {
            return "";
        }
    }
    async paneDead(name) {
        this.assertSafe(name);
        try {
            const { stdout } = await execFileAsync("tmux", [
                "display-message", "-p", "-t", name, "#{pane_dead}:#{pane_dead_status}",
            ]);
            const [dead, status] = stdout.trim().split(":");
            return { dead: dead === "1", exitStatus: parseInt(status ?? "0", 10) };
        }
        catch {
            return { dead: false, exitStatus: 0 };
        }
    }
}
exports.TmuxManager = TmuxManager;
TmuxManager.SESSION_PREFIX = "beads-ui-";
TmuxManager.VALID_NAME = /^[a-zA-Z0-9_-]+$/;
exports.tmuxManager = new TmuxManager();
// ── Execution manager ─────────────────────────────────────────────────────────
class ExecutionManager {
    constructor(triggerStore) {
        this.triggerStore = triggerStore;
        this.executions = new Map();
        this.processes = new Map();
        this.listeners = new Map();
        // Poll tmux sessions for liveness every 2s
        setInterval(() => { void this.pollTmuxSessions(); }, 2000);
    }
    async pollTmuxSessions() {
        for (const exec of this.executions.values()) {
            if (exec.runtimeKind !== "tmux" || exec.status !== "running" || !exec.tmuxSession)
                continue;
            const alive = await exports.tmuxManager.hasSession(exec.tmuxSession);
            // Re-check after await: completeTmux/cancel may have run while we were waiting
            if (exec.status !== "running")
                continue;
            if (!alive) {
                exec.status = "failed";
                exec.finishedAt = new Date().toISOString();
                this.notify(exec.id, "", true, "failed");
                this.fireTriggers(exec.issueId, "execution_failed", "");
                continue;
            }
            // remain-on-exit keeps the pane alive after process exits — detect dead panes
            const pane = await exports.tmuxManager.paneDead(exec.tmuxSession);
            // Re-check again: status may have changed during the second await
            if (exec.status !== "running")
                continue;
            if (pane.dead) {
                exec.status = pane.exitStatus === 0 ? "completed" : "failed";
                exec.finishedAt = new Date().toISOString();
                this.notify(exec.id, "", true, exec.status);
                if (exec.status === "completed") {
                    this.fireTriggers(exec.issueId, "execution_completed", "");
                }
                else {
                    this.fireTriggers(exec.issueId, "execution_failed", "");
                }
            }
        }
    }
    startTmux(issueId, shellCommand, triggeredBy, projectDir) {
        const id = ExecutionManager.genId();
        const sessionName = exports.tmuxManager.sessionName(id);
        const exec = {
            id,
            issueId,
            command: shellCommand,
            status: "running",
            output: "",
            startedAt: new Date().toISOString(),
            triggeredBy,
            runtimeKind: "tmux",
            tmuxSession: sessionName,
        };
        this.executions.set(id, exec);
        exports.tmuxManager.start(id, shellCommand, projectDir).catch((err) => {
            exec.status = "failed";
            exec.finishedAt = new Date().toISOString();
            exec.output = `Failed to start tmux session: ${err.message}\n`;
            this.notify(id, exec.output, true, "failed");
        });
        return exec;
    }
    start(issueId, command, triggeredBy, projectDir) {
        const id = ExecutionManager.genId();
        const exec = {
            id,
            issueId,
            command,
            status: "running",
            output: "",
            startedAt: new Date().toISOString(),
            triggeredBy,
            runtimeKind: "process",
        };
        this.executions.set(id, exec);
        const actor = triggeredBy === "manual" ? "agent" : `agent:${triggeredBy}`;
        const proc = (0, child_process_1.spawn)("sh", ["-c", command], {
            cwd: projectDir,
            env: { ...process.env, BEADS_ACTOR: actor },
            stdio: ["ignore", "pipe", "pipe"],
        });
        this.processes.set(id, proc);
        const isStreamJson = command.includes("--output-format stream-json");
        let onData;
        if (isStreamJson) {
            const parser = new StreamJsonParser((text) => {
                exec.output += text;
                this.notify(id, text, false);
            });
            onData = (data) => parser.process(data.toString());
        }
        else {
            onData = (data) => {
                const chunk = data.toString();
                exec.output += chunk;
                this.notify(id, chunk, false);
            };
        }
        proc.stdout?.on("data", onData);
        proc.stderr?.on("data", (data) => {
            const chunk = data.toString();
            exec.output += chunk;
            this.notify(id, chunk, false);
        });
        proc.on("close", (code) => {
            exec.exitCode = code ?? undefined;
            exec.status = code === 0 ? "completed" : "failed";
            exec.finishedAt = new Date().toISOString();
            this.processes.delete(id);
            this.notify(id, "", true, exec.status, exec.exitCode);
            this.fireTriggers(issueId, exec.status === "completed" ? "execution_completed" : "execution_failed", projectDir);
        });
        proc.on("error", (err) => {
            const msg = `\nProcess error: ${err.message}\n`;
            exec.output += msg;
            exec.status = "failed";
            exec.finishedAt = new Date().toISOString();
            this.processes.delete(id);
            this.notify(id, msg, true, "failed");
        });
        return exec;
    }
    cancel(id) {
        console.log(`Cancelling execution ${id}`);
        const exec = this.executions.get(id);
        if (!exec)
            return false;
        if (exec.runtimeKind === "tmux" && exec.tmuxSession) {
            exports.tmuxManager.kill(exec.tmuxSession).catch(() => { });
            if (exec.status === "running") {
                exec.status = "cancelled";
                exec.finishedAt = new Date().toISOString();
                this.notify(id, "", true, "cancelled");
            }
            return true;
        }
        const proc = this.processes.get(id);
        if (!proc)
            return false;
        proc.kill("SIGTERM");
        exec.status = "cancelled";
        exec.finishedAt = new Date().toISOString();
        this.notify(id, "", true, "cancelled");
        this.processes.delete(id);
        return true;
    }
    completeTmux(id) {
        console.log(`Completing tmux execution ${id}`);
        const exec = this.executions.get(id);
        if (!exec || exec.runtimeKind !== "tmux" || !exec.tmuxSession)
            return false;
        exports.tmuxManager.kill(exec.tmuxSession).catch(() => { });
        if (exec.status === "running") {
            exec.status = "completed";
            exec.finishedAt = new Date().toISOString();
            this.notify(id, "", true, "completed");
            this.fireTriggers(exec.issueId, "execution_completed", "");
        }
        return true;
    }
    getAllTmux() {
        return Array.from(this.executions.values()).filter((e) => e.runtimeKind === "tmux");
    }
    getForIssue(issueId) {
        return Array.from(this.executions.values())
            .filter((e) => e.issueId === issueId)
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    }
    get(id) {
        return this.executions.get(id);
    }
    subscribe(id, fn) {
        if (!this.listeners.has(id))
            this.listeners.set(id, new Set());
        this.listeners.get(id).add(fn);
        return () => this.listeners.get(id)?.delete(fn);
    }
    notify(id, chunk, done, status, exitCode) {
        const subs = this.listeners.get(id);
        if (!subs)
            return;
        for (const fn of subs)
            fn(chunk, done, status, exitCode);
        if (done)
            this.listeners.delete(id);
    }
    fireTriggers(issueId, condition, projectDir) {
        for (const t of this.triggerStore.getMatching(issueId, condition)) {
            this.start(issueId, t.command, t.id, projectDir);
        }
    }
    static genId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
}
exports.ExecutionManager = ExecutionManager;
// ── Singletons ────────────────────────────────────────────────────────────────
exports.triggerStore = new TriggerStore();
exports.executionManager = new ExecutionManager(exports.triggerStore);
