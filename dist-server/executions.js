"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startExecution = startExecution;
exports.cancelExecution = cancelExecution;
exports.getExecutionsForIssue = getExecutionsForIssue;
exports.getExecution = getExecution;
exports.subscribeToExecution = subscribeToExecution;
exports.getTriggersForIssue = getTriggersForIssue;
exports.createTrigger = createTrigger;
exports.updateTrigger = updateTrigger;
exports.deleteTrigger = deleteTrigger;
const child_process_1 = require("child_process");
// ── stream-json parser ────────────────────────────────────────────────────────
function fmtToolInput(name, input) {
    if (name === "Bash" && typeof input.command === "string") {
        const cmd = input.command.slice(0, 300);
        return `\`${cmd}${input.command.length > 300 ? "…" : ""}\``;
    }
    const s = JSON.stringify(input ?? {});
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
}
function makeStreamJsonParser(onText) {
    let buf = "";
    // Track tool_use blocks being assembled via stream_events (index → block state)
    const toolBlocks = new Map();
    function handleStreamEvent(event) {
        const type = event.type;
        if (type === "content_block_start") {
            const block = event.content_block;
            if (block?.type === "tool_use") {
                toolBlocks.set(event.index, { name: block.name, inputJson: "" });
            }
            return "";
        }
        if (type === "content_block_delta") {
            const delta = event.delta;
            if (delta?.type === "text_delta")
                return delta.text ?? "";
            if (delta?.type === "input_json_delta") {
                const block = toolBlocks.get(event.index);
                if (block)
                    block.inputJson += delta.partial_json ?? "";
            }
            return "";
        }
        if (type === "content_block_stop") {
            const block = toolBlocks.get(event.index);
            if (block) {
                toolBlocks.delete(event.index);
                let input = {};
                try {
                    input = JSON.parse(block.inputJson || "{}");
                }
                catch { /* partial input */ }
                return `\n\x1b[36m▶ ${block.name}\x1b[0m ${fmtToolInput(block.name, input)}\n`;
            }
            return "";
        }
        return "";
    }
    function handle(ev) {
        if (ev.type === "stream_event") {
            return handleStreamEvent(ev.event ?? {});
        }
        // User message — show tool results (truncated)
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
        // Final result summary
        if (ev.type === "result") {
            const cost = typeof ev.total_cost_usd === "number" ? ` · $${ev.total_cost_usd.toFixed(4)}` : "";
            return `\n\x1b[2m[done${cost}]\x1b[0m\n`;
        }
        return "";
    }
    return (chunk) => {
        buf += chunk;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const text = handle(JSON.parse(trimmed));
                if (text)
                    onText(text);
            }
            catch {
                onText(trimmed + "\n");
            }
        }
    };
}
const executions = new Map();
const processes = new Map();
const listeners = new Map();
const triggers = new Map();
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function notify(id, chunk, done, status, exitCode) {
    const subs = listeners.get(id);
    if (!subs)
        return;
    for (const fn of subs)
        fn(chunk, done, status, exitCode);
    if (done)
        listeners.delete(id);
}
function fireTriggers(issueId, condition, projectDir) {
    for (const t of triggers.values()) {
        if (t.issueId !== issueId || !t.enabled || t.condition !== condition)
            continue;
        startExecution(issueId, t.command, t.id, projectDir);
    }
}
function startExecution(issueId, command, triggeredBy, projectDir) {
    const id = genId();
    const exec = {
        id,
        issueId,
        command,
        status: "running",
        output: "",
        startedAt: new Date().toISOString(),
        triggeredBy,
    };
    executions.set(id, exec);
    const proc = (0, child_process_1.spawn)("sh", ["-c", command], {
        cwd: projectDir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
    });
    processes.set(id, proc);
    const isStreamJson = command.includes("--output-format stream-json");
    let onData;
    if (isStreamJson) {
        const parse = makeStreamJsonParser((text) => {
            exec.output += text;
            notify(id, text, false);
        });
        onData = (data) => parse(data.toString());
    }
    else {
        onData = (data) => {
            const chunk = data.toString();
            exec.output += chunk;
            notify(id, chunk, false);
        };
    }
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", (data) => {
        // stderr is never stream-json; always pass through raw
        const chunk = data.toString();
        exec.output += chunk;
        notify(id, chunk, false);
    });
    proc.on("close", (code) => {
        exec.exitCode = code ?? undefined;
        exec.status = code === 0 ? "completed" : "failed";
        exec.finishedAt = new Date().toISOString();
        processes.delete(id);
        notify(id, "", true, exec.status, exec.exitCode);
        fireTriggers(issueId, exec.status === "completed" ? "execution_completed" : "execution_failed", projectDir);
    });
    proc.on("error", (err) => {
        const msg = `\nProcess error: ${err.message}\n`;
        exec.output += msg;
        exec.status = "failed";
        exec.finishedAt = new Date().toISOString();
        processes.delete(id);
        notify(id, msg, true, "failed");
    });
    return exec;
}
function cancelExecution(id) {
    const proc = processes.get(id);
    if (!proc)
        return false;
    proc.kill("SIGTERM");
    const exec = executions.get(id);
    if (exec) {
        exec.status = "cancelled";
        exec.finishedAt = new Date().toISOString();
        notify(id, "", true, "cancelled");
    }
    processes.delete(id);
    return true;
}
function getExecutionsForIssue(issueId) {
    return Array.from(executions.values())
        .filter((e) => e.issueId === issueId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
function getExecution(id) {
    return executions.get(id);
}
function subscribeToExecution(id, fn) {
    if (!listeners.has(id))
        listeners.set(id, new Set());
    listeners.get(id).add(fn);
    return () => listeners.get(id)?.delete(fn);
}
// Triggers
function getTriggersForIssue(issueId) {
    return Array.from(triggers.values()).filter((t) => t.issueId === issueId);
}
function createTrigger(data) {
    const trigger = { ...data, id: genId(), createdAt: new Date().toISOString() };
    triggers.set(trigger.id, trigger);
    return trigger;
}
function updateTrigger(id, patch) {
    const t = triggers.get(id);
    if (!t)
        return undefined;
    Object.assign(t, patch);
    return t;
}
function deleteTrigger(id) {
    return triggers.delete(id);
}
