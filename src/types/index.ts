export type Status = "open" | "in_progress" | "blocked" | "deferred" | "closed";
export type IssueType = "bug" | "feature" | "task" | "epic" | "chore";
export type DependencyType = "blocks" | "related" | "parent-child" | "discovered-from";

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
  body: string;
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
