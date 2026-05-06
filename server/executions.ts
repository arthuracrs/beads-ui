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
  });
  processes.set(id, proc);

  const onData = (data: Buffer) => {
    const chunk = data.toString();
    exec.output += chunk;
    notify(id, chunk, false);
  };
  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);

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
