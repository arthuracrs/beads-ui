import type { AgentExecution, ExecStatus } from "../types";
import { TimeFormatter } from "../lib/TimeFormatter";

export class ExecutionModel implements AgentExecution {
  id!: string;
  issueId!: string;
  mode!: "headless" | "tmux";
  status!: ExecStatus;
  output!: string;
  exitCode?: number;
  startedAt!: string;
  finishedAt?: string;
  triggeredBy!: string;
  tmuxSession?: string;
  prompt?: string;
  runtimeId?: string;

  private constructor(data: AgentExecution) {
    Object.assign(this, data);
  }

  static from(data: AgentExecution): ExecutionModel {
    return new ExecutionModel(data);
  }

  isRunning(): boolean { return this.status === "running"; }
  isCompleted(): boolean { return this.status === "completed"; }
  isFailed(): boolean { return this.status === "failed"; }
  isCancelled(): boolean { return this.status === "cancelled"; }
  isTriggered(): boolean { return this.triggeredBy !== "manual"; }

  timeAgo(): string { return TimeFormatter.timeAgo(this.startedAt); }
  elapsed(): string { return TimeFormatter.elapsed(this.startedAt, this.finishedAt); }
}
