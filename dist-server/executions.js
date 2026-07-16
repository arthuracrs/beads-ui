"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionManager = exports.triggerStore = exports.ExecutionManager = exports.TriggerStore = void 0;
const child_process_1 = require("child_process");
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
// ── Execution manager ─────────────────────────────────────────────────────────
class ExecutionManager {
    constructor(triggerStore) {
        this.triggerStore = triggerStore;
        this.executions = new Map();
        this.processes = new Map();
        this.listeners = new Map();
    }
    start(issueId, runtimeId, prompt, mode, systemPrompt, projectDir, anagentBin, anagentArgs, triggeredBy) {
        const id = ExecutionManager.genId();
        const exec = {
            id,
            issueId,
            mode,
            status: "running",
            output: "",
            startedAt: new Date().toISOString(),
            triggeredBy,
            runtimeId,
            prompt,
        };
        this.executions.set(id, exec);
        const proc = (0, child_process_1.spawn)(anagentBin, anagentArgs, {
            stdio: ["ignore", "pipe", "pipe"],
            cwd: projectDir,
        });
        this.processes.set(id, proc);
        if (mode === "headless") {
            let buf = "";
            proc.stdout?.on("data", (data) => {
                const chunk = data.toString();
                exec.output += chunk;
                buf += chunk;
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const event = JSON.parse(trimmed);
                        this.notify(id, event, false);
                    }
                    catch {
                        // Not JSON — forward as text delta
                        this.notify(id, { type: "text", delta: trimmed + "\n" }, false);
                    }
                }
            });
            proc.stderr?.on("data", (data) => {
                const chunk = data.toString();
                exec.output += chunk;
                if (chunk.trim()) {
                    this.notify(id, { type: "text", delta: chunk }, false);
                }
            });
        }
        else {
            // Tmux mode: collect all output, notify on completion
            proc.stdout?.on("data", (data) => {
                exec.output += data.toString();
            });
            proc.stderr?.on("data", (data) => {
                exec.output += data.toString();
            });
        }
        proc.on("close", (code) => {
            exec.exitCode = code ?? undefined;
            exec.status = code === 0 ? "completed" : "failed";
            exec.finishedAt = new Date().toISOString();
            this.processes.delete(id);
            this.notify(id, null, true, exec.status, exec.exitCode);
            this.fireTriggers(issueId, exec.status === "completed" ? "execution_completed" : "execution_failed", projectDir);
        });
        proc.on("error", (err) => {
            const msg = `\nError: ${err.message}\n`;
            exec.output += msg;
            exec.status = "failed";
            exec.finishedAt = new Date().toISOString();
            this.processes.delete(id);
            this.notify(id, { type: "text", delta: msg }, false);
            this.notify(id, null, true, "failed");
        });
        return exec;
    }
    cancel(id) {
        const exec = this.executions.get(id);
        if (!exec)
            return false;
        const proc = this.processes.get(id);
        if (proc) {
            proc.kill("SIGTERM");
            this.processes.delete(id);
        }
        if (exec.status === "running") {
            exec.status = "cancelled";
            exec.finishedAt = new Date().toISOString();
            this.notify(id, null, true, "cancelled");
        }
        return true;
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
    notify(id, event, done, status, exitCode) {
        const subs = this.listeners.get(id);
        if (!subs)
            return;
        for (const fn of subs)
            fn(event, done, status, exitCode);
        if (done)
            this.listeners.delete(id);
    }
    fireTriggers(issueId, condition, projectDir) {
        for (const t of this.triggerStore.getMatching(issueId, condition)) {
            const args = ["run", t.command, "--json", "--cwd", projectDir];
            const proc = (0, child_process_1.spawn)("anagent", args, { stdio: "ignore", cwd: projectDir });
            proc.unref();
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
