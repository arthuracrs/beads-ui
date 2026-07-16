import { spawn, ChildProcess } from "child_process";

export type ExecStatus = "running" | "completed" | "failed" | "cancelled";

export interface AgentExecution {
  id: string;
  issueId: string;
  mode: "headless" | "tmux";
  status: ExecStatus;
  output: string;
  exitCode?: number;
  startedAt: string;
  finishedAt?: string;
  triggeredBy: "manual" | string;
  tmuxSession?: string;
  prompt?: string;
  runtimeId?: string;
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

type OutputListener = (event: object | null, done: boolean, status?: string, exitCode?: number) => void;

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

  start(
    issueId: string,
    runtimeId: string,
    prompt: string,
    mode: "headless" | "tmux",
    systemPrompt: string,
    projectDir: string,
    anagentBin: string,
    anagentArgs: string[],
    triggeredBy: string,
  ): AgentExecution {
    const id = ExecutionManager.genId();
    const exec: AgentExecution = {
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

    const proc = spawn(anagentBin, anagentArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: projectDir,
    });
    this.processes.set(id, proc);

    if (mode === "headless") {
      let buf = "";
      proc.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        exec.output += chunk;
        buf += chunk;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as object;
            this.notify(id, event, false);
          } catch {
            // Not JSON — forward as text delta
            this.notify(id, { type: "text", delta: trimmed + "\n" }, false);
          }
        }
      });
      proc.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        exec.output += chunk;
        if (chunk.trim()) {
          this.notify(id, { type: "text", delta: chunk }, false);
        }
      });
    } else {
      // Tmux mode: collect all output, notify on completion
      proc.stdout?.on("data", (data: Buffer) => {
        exec.output += data.toString();
      });
      proc.stderr?.on("data", (data: Buffer) => {
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

  cancel(id: string): boolean {
    const exec = this.executions.get(id);
    if (!exec) return false;
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

  private notify(id: string, event: object | null, done: boolean, status?: string, exitCode?: number): void {
    const subs = this.listeners.get(id);
    if (!subs) return;
    for (const fn of subs) fn(event, done, status, exitCode);
    if (done) this.listeners.delete(id);
  }

  private fireTriggers(issueId: string, condition: AgentTrigger["condition"], projectDir: string): void {
    for (const t of this.triggerStore.getMatching(issueId, condition)) {
      const args = ["run", t.command, "--json", "--cwd", projectDir];
      const proc = spawn("anagent", args, { stdio: "ignore", cwd: projectDir });
      proc.unref();
    }
  }

  private static genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}

// ── Singletons ────────────────────────────────────────────────────────────────

export const triggerStore = new TriggerStore();
export const executionManager = new ExecutionManager(triggerStore);
