import { spawn, ChildProcess } from "child_process";

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
  triggeredBy: "manual" | string;
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

// ── Stream JSON parser ────────────────────────────────────────────────────────

class StreamJsonParser {
  private buf = "";
  private readonly toolBlocks = new Map<number, { name: string; inputJson: string }>();

  constructor(private readonly onText: (text: string) => void) {}

  process(chunk: string): void {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const text = this.handle(JSON.parse(trimmed) as Record<string, unknown>);
        if (text) this.onText(text);
      } catch {
        this.onText(trimmed + "\n");
      }
    }
  }

  private handle(ev: Record<string, unknown>): string {
    if (ev.type === "stream_event") {
      return this.handleStreamEvent((ev.event as Record<string, unknown>) ?? {});
    }
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
    if (ev.type === "result") {
      const cost = typeof ev.total_cost_usd === "number" ? ` · $${(ev.total_cost_usd as number).toFixed(4)}` : "";
      return `\n\x1b[2m[done${cost}]\x1b[0m\n`;
    }
    return "";
  }

  private handleStreamEvent(event: Record<string, unknown>): string {
    const type = event.type as string;

    if (type === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use") {
        this.toolBlocks.set(event.index as number, { name: block.name as string, inputJson: "" });
      }
      return "";
    }

    if (type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") return (delta.text as string) ?? "";
      if (delta?.type === "input_json_delta") {
        const block = this.toolBlocks.get(event.index as number);
        if (block) block.inputJson += (delta.partial_json as string) ?? "";
      }
      return "";
    }

    if (type === "content_block_stop") {
      const block = this.toolBlocks.get(event.index as number);
      if (block) {
        this.toolBlocks.delete(event.index as number);
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(block.inputJson || "{}"); } catch { /* partial input */ }
        return `\n\x1b[36m▶ ${block.name}\x1b[0m ${StreamJsonParser.fmtToolInput(block.name, input)}\n`;
      }
      return "";
    }

    return "";
  }

  private static fmtToolInput(name: string, input: Record<string, unknown>): string {
    if (name === "Bash" && typeof input.command === "string") {
      const cmd = input.command.slice(0, 300);
      return `\`${cmd}${input.command.length > 300 ? "…" : ""}\``;
    }
    const s = JSON.stringify(input ?? {});
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  }
}

// ── Trigger store ─────────────────────────────────────────────────────────────

export class TriggerStore {
  private readonly triggers = new Map<string, AgentTrigger>();

  getForIssue(issueId: string): AgentTrigger[] {
    return Array.from(this.triggers.values()).filter((t) => t.issueId === issueId);
  }

  getMatching(issueId: string, condition: AgentTrigger["condition"]): AgentTrigger[] {
    return Array.from(this.triggers.values()).filter(
      (t) => t.issueId === issueId && t.enabled && t.condition === condition
    );
  }

  create(data: Omit<AgentTrigger, "id" | "createdAt">): AgentTrigger {
    const trigger: AgentTrigger = { ...data, id: TriggerStore.genId(), createdAt: new Date().toISOString() };
    this.triggers.set(trigger.id, trigger);
    return trigger;
  }

  update(id: string, patch: Partial<AgentTrigger>): AgentTrigger | undefined {
    const t = this.triggers.get(id);
    if (!t) return undefined;
    Object.assign(t, patch);
    return t;
  }

  delete(id: string): boolean {
    return this.triggers.delete(id);
  }

  private static genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}

// ── Execution manager ─────────────────────────────────────────────────────────

export class ExecutionManager {
  private readonly executions = new Map<string, AgentExecution>();
  private readonly processes = new Map<string, ChildProcess>();
  private readonly listeners = new Map<string, Set<OutputListener>>();

  constructor(private readonly triggerStore: TriggerStore) {}

  start(issueId: string, command: string, triggeredBy: string, projectDir: string): AgentExecution {
    const id = ExecutionManager.genId();
    const exec: AgentExecution = {
      id,
      issueId,
      command,
      status: "running",
      output: "",
      startedAt: new Date().toISOString(),
      triggeredBy,
    };
    this.executions.set(id, exec);

    const actor = triggeredBy === "manual" ? "agent" : `agent:${triggeredBy}`;
    const proc = spawn("sh", ["-c", command], {
      cwd: projectDir,
      env: { ...process.env, BEADS_ACTOR: actor },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.processes.set(id, proc);

    const isStreamJson = command.includes("--output-format stream-json");

    let onData: (data: Buffer) => void;
    if (isStreamJson) {
      const parser = new StreamJsonParser((text) => {
        exec.output += text;
        this.notify(id, text, false);
      });
      onData = (data: Buffer) => parser.process(data.toString());
    } else {
      onData = (data: Buffer) => {
        const chunk = data.toString();
        exec.output += chunk;
        this.notify(id, chunk, false);
      };
    }
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", (data: Buffer) => {
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

  cancel(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    proc.kill("SIGTERM");
    const exec = this.executions.get(id);
    if (exec) {
      exec.status = "cancelled";
      exec.finishedAt = new Date().toISOString();
      this.notify(id, "", true, "cancelled");
    }
    this.processes.delete(id);
    return true;
  }

  getForIssue(issueId: string): AgentExecution[] {
    return Array.from(this.executions.values())
      .filter((e) => e.issueId === issueId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  get(id: string): AgentExecution | undefined {
    return this.executions.get(id);
  }

  subscribe(id: string, fn: OutputListener): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(fn);
    return () => this.listeners.get(id)?.delete(fn);
  }

  private notify(id: string, chunk: string, done: boolean, status?: string, exitCode?: number): void {
    const subs = this.listeners.get(id);
    if (!subs) return;
    for (const fn of subs) fn(chunk, done, status, exitCode);
    if (done) this.listeners.delete(id);
  }

  private fireTriggers(issueId: string, condition: AgentTrigger["condition"], projectDir: string): void {
    for (const t of this.triggerStore.getMatching(issueId, condition)) {
      this.start(issueId, t.command, t.id, projectDir);
    }
  }

  private static genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}

// ── Singletons ────────────────────────────────────────────────────────────────

export const triggerStore = new TriggerStore();
export const executionManager = new ExecutionManager(triggerStore);
