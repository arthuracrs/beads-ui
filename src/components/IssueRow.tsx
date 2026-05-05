import type { Issue } from "../types";
import { StatusBadge, TypeBadge, PriorityBadge } from "./Badge";

interface Props {
  issue: Issue;
  onClick: () => void;
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function IssueRow({ issue, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left hover:border-[var(--accent)]/40 hover:bg-[var(--surface2)] transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-[var(--text-muted)]">{issue.id}</span>
          <PriorityBadge priority={issue.priority} />
          <TypeBadge type={issue.issue_type} />
          {issue.assignee && (
            <span className="text-xs text-[var(--text-muted)]">@{issue.assignee}</span>
          )}
        </div>
        <p className={`mt-0.5 text-sm font-medium leading-snug ${issue.status === "closed" ? "text-[var(--text-muted)] line-through" : "text-[var(--text)]"}`}>
          {issue.title}
        </p>
        {issue.description && (
          <p className="mt-0.5 text-xs text-[var(--text-muted)] line-clamp-1">{issue.description}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <StatusBadge status={issue.status} />
        <span className="text-xs text-[var(--text-muted)]">{timeAgo(issue.updated_at)}</span>
      </div>
    </button>
  );
}
