import { spawn, ChildProcess } from "child_process";

// ── stream-json parser ────────────────────────────────────────────────────────

function fmtToolInput(name: string, input: Record<string, unknown>): string {
  if (name === "Bash" && typeof input.command === "string") {
    const cmd = input.command.slice(0, 300);
    return `\`${cmd}${input.command.length > 300 ? "…" : ""}\``;
  }
  const s = JSON.stringify(input ?? {});
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

function makeStreamJsonParser(onText: (text: string) => void): (chunk: string) => void {
  let buf = "";
  // Track tool_use blocks being assembled via stream_events (index → block state)
  const toolBlocks = new Map<number, { name: string; inputJson: string }>();

  function handleStreamEvent(event: Record<string, unknown>): string {
    const type = event.type as string;

    if (type === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use") {
        toolBlocks.set(event.index as number, { name: block.name as string, inputJson: "" });
      }
      return "";
    }

    if (type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") return (delta.text as string) ?? "";
      if (delta?.type === "input_json_delta") {
        const block = toolBlocks.get(event.index as number);
        if (block) block.inputJson += (delta.partial_json as string) ?? "";
      }
      return "";
    }

    if (type === "content_block_stop") {
      const block = toolBlocks.get(event.index as number);
      if (block) {
        toolBlocks.delete(event.index as number);
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(block.inputJson || "{}"); } catch { /* partial input */ }
        return `\n\x1b[36m▶ ${block.name}\x1b[0m ${fmtToolInput(block.name, input)}\n`;
      }
      return "";
    }

    return "";
  }

  function handle(ev: Record<string, unknown>): string {
    if (ev.type === "stream_event") {
      return handleStreamEvent((ev.event as Record<string, unknown>) ?? {});
    }

    // User message — show tool results (truncated)
    if (ev.type === "user") {
      const content = ((ev.message as Record<string, unknown>)?.content as Record<string, unknown>[]) ?? [];
      return content
        .filter((b) => b.type === "tool_result")
        .map((b) => {
          const blocks = (Array.isArray(b.content) ? b.content : [b.content]) as Record<string, unknown>[];
          const text = blocks.filter((c) => c?.type === "text").map((c) => c.text as string).join("").trim();
          if (!text) return "";
          const truncated = text.length > 500 ? text.slice(0, 500) + "\n\x1b[2m…(truncated)\x1b[0m" : text;
          return `\x1b[2m${truncated}\x1b[0m\n`;
        })
        .join("");
    }

    // Final result summary
    if (ev.type === "result") {
      const cost = typeof ev.total_cost_usd === "number" ? ` · $${(ev.total_cost_usd as number).toFixed(4)}` : "";
      return `\n\x1b[2m[done${cost}]\x1b[0m\n`;
    }

    return "";
  }

  return (chunk: string) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const text = handle(JSON.parse(trimmed) as Record<string, unknown>);
        if (text) onText(text);
      } catch {
        onText(trimmed + "\n");
      }
    }
  };
}

export type ExecStatus = "running" | "completed" | "failed" | "cancelled";

export interface AgentExecution {
  id: string;
  issueId: string;
  command: string;
  status: ExecStatus;
  output: string;
  exitCode?: number;
  startedAt: string;
  finishedAt?: string;
  triggeredBy: "manual" | string; // "manual" or trigger id
}

export interface AgentTrigger {
  id: string;
  issueId: string;
  name: string;
  condition: "execution_completed" | "execution_failed";
  command: string;
  enabled: boolean;
  createdAt: string;
}

type OutputListener = (chunk: string, done: boolean, status?: string, exitCode?: number) => void;

const executions = new Map<string, AgentExecution>();
const processes = new Map<string, ChildProcess>();
const listeners = new Map<string, Set<OutputListener>>();
const triggers = new Map<string, AgentTrigger>();

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function notify(id: string, chunk: string, done: boolean, status?: string, exitCode?: number) {
  const subs = listeners.get(id);
  if (!subs) return;
  for (const fn of subs) fn(chunk, done, status, exitCode);
  if (done) listeners.delete(id);
}

function fireTriggers(issueId: string, condition: AgentTrigger["condition"], projectDir: string) {
  for (const t of triggers.values()) {
    if (t.issueId !== issueId || !t.enabled || t.condition !== condition) continue;
    startExecution(issueId, t.command, t.id, projectDir);
  }
}

export function startExecution(
  issueId: string,
  command: string,
  triggeredBy: string,
  projectDir: string
): AgentExecution {
  const id = genId();
  const exec: AgentExecution = {
    id,
    issueId,
    command,
    status: "running",
    output: "",
    startedAt: new Date().toISOString(),
    triggeredBy,
  };
  executions.set(id, exec);

  const proc = spawn("sh", ["-c", command], {
    cwd: projectDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.set(id, proc);

  const isStreamJson = command.includes("--output-format stream-json");

  let onData: (data: Buffer) => void;
  if (isStreamJson) {
    const parse = makeStreamJsonParser((text) => {
      exec.output += text;
      notify(id, text, false);
    });
    onData = (data: Buffer) => parse(data.toString());
  } else {
    onData = (data: Buffer) => {
      const chunk = data.toString();
      exec.output += chunk;
      notify(id, chunk, false);
    };
  }
  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", (data: Buffer) => {
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

export function cancelExecution(id: string): boolean {
  const proc = processes.get(id);
  if (!proc) return false;
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

export function getExecutionsForIssue(issueId: string): AgentExecution[] {
  return Array.from(executions.values())
    .filter((e) => e.issueId === issueId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function getExecution(id: string): AgentExecution | undefined {
  return executions.get(id);
}

export function subscribeToExecution(id: string, fn: OutputListener): () => void {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(fn);
  return () => listeners.get(id)?.delete(fn);
}

// Triggers
export function getTriggersForIssue(issueId: string): AgentTrigger[] {
  return Array.from(triggers.values()).filter((t) => t.issueId === issueId);
}

export function createTrigger(data: Omit<AgentTrigger, "id" | "createdAt">): AgentTrigger {
  const trigger: AgentTrigger = { ...data, id: genId(), createdAt: new Date().toISOString() };
  triggers.set(trigger.id, trigger);
  return trigger;
}

export function updateTrigger(id: string, patch: Partial<AgentTrigger>): AgentTrigger | undefined {
  const t = triggers.get(id);
  if (!t) return undefined;
  Object.assign(t, patch);
  return t;
}

export function deleteTrigger(id: string): boolean {
  return triggers.delete(id);
}
