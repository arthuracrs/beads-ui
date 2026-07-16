export type Status = "open" | "in_progress" | "blocked" | "deferred" | "closed";
export type IssueType = "bug" | "feature" | "task" | "epic" | "chore";
export type DependencyType = "blocks" | "related" | "parent-child" | "relates-to" | "duplicates" | "supersedes" | "replies-to";

export interface Issue {
  id: string;
  title: string;
  description?: string;
  status: Status;
  priority: number;
  issue_type: IssueType;
  assignee?: string;
  labels?: string[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  due_at?: string;
  defer_until?: string;
  dependencies?: Dependency[];
  comments?: Comment[];
}

export interface Dependency {
  id: string;
  dep_type: DependencyType;
  title?: string;
  status?: Status;
}

export interface Comment {
  id: string;
  text: string;
  author?: string;
  created_at: string;
}

export interface StatsSummary {
  total_issues?: number;
  open_issues?: number;
  in_progress_issues?: number;
  blocked_issues?: number;
  closed_issues?: number;
  ready_issues?: number;
  deferred_issues?: number;
}

export interface Stats {
  summary?: StatsSummary;
  [key: string]: unknown;
}

export interface AgentRuntime {
  id: string;
  name: string;
  description: string;
  defaultMode: "headless" | "tmux";
}

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
  triggeredBy: string;
  tmuxSession?: string;
  prompt?: string;
  runtimeId?: string;
}

export interface Formula {
  name: string;
  description?: string;
  type?: string;
  source?: string;
  variables?: Record<string, unknown>;
  steps?: unknown[];
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
