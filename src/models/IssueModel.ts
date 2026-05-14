import type { Issue, Status, IssueType, Dependency, Comment } from "../types";
import { TimeFormatter } from "../lib/TimeFormatter";

export class IssueModel implements Issue {
  id!: string;
  title!: string;
  description?: string;
  status!: Status;
  priority!: number;
  issue_type!: IssueType;
  assignee?: string;
  labels?: string[];
  created_at!: string;
  updated_at!: string;
  closed_at?: string;
  close_reason?: string;
  due_at?: string;
  defer_until?: string;
  dependencies?: Dependency[];
  comments?: Comment[];

  private constructor(data: Issue) {
    Object.assign(this, data);
  }

  static from(data: Issue): IssueModel {
    return new IssueModel(data);
  }

  isOpen(): boolean { return this.status === "open"; }
  isClosed(): boolean { return this.status === "closed"; }
  isBlocked(): boolean { return this.status === "blocked"; }
  isInProgress(): boolean { return this.status === "in_progress"; }
  isDeferred(): boolean { return this.status === "deferred"; }
  isCritical(): boolean { return this.priority === 0; }

  timeAgo(): string { return TimeFormatter.timeAgo(this.updated_at); }
  createdFmt(): string { return TimeFormatter.fmt(this.created_at); }
  updatedFmt(): string { return TimeFormatter.fmt(this.updated_at); }
  closedFmt(): string { return TimeFormatter.fmt(this.closed_at); }

  commentCount(): number { return this.comments?.length ?? 0; }
}
