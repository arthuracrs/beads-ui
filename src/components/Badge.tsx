import type { Status, IssueType } from "../types";

const statusConfig: Record<Status, { label: string; color: string; icon: string }> = {
  open:        { label: "Open",        color: "text-[var(--text-muted)] border-[var(--border)]",   icon: "○" },
  in_progress: { label: "In Progress", color: "text-[var(--yellow)] border-[var(--yellow)]/30",    icon: "◐" },
  blocked:     { label: "Blocked",     color: "text-[var(--red)] border-[var(--red)]/30",          icon: "●" },
  deferred:    { label: "Deferred",    color: "text-[var(--accent)] border-[var(--accent)]/30",    icon: "❄" },
  closed:      { label: "Closed",      color: "text-[var(--text-muted)] border-[var(--border)]",   icon: "✓" },
};

const typeConfig: Record<IssueType, { color: string }> = {
  bug:     { color: "text-[var(--red)] bg-[var(--red)]/10 border-[var(--red)]/20" },
  feature: { color: "text-[var(--green)] bg-[var(--green)]/10 border-[var(--green)]/20" },
  task:    { color: "text-[var(--text-muted)] bg-[var(--surface2)] border-[var(--border)]" },
  epic:    { color: "text-[var(--purple)] bg-[var(--purple)]/10 border-[var(--purple)]/20" },
  chore:   { color: "text-[var(--text-muted)] bg-[var(--surface2)] border-[var(--border)]" },
};

const priorityConfig: Record<number, { label: string; color: string }> = {
  0: { label: "P0", color: "text-[var(--red)] font-bold" },
  1: { label: "P1", color: "text-[var(--orange)]" },
  2: { label: "P2", color: "text-[var(--text-muted)]" },
  3: { label: "P3", color: "text-[var(--text-muted)]" },
  4: { label: "P4", color: "text-[var(--text-muted)]" },
};

export function StatusBadge({ status }: { status: Status }) {
  const cfg = statusConfig[status] ?? statusConfig.open;
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${cfg.color}`}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

export function TypeBadge({ type }: { type: IssueType }) {
  const cfg = typeConfig[type] ?? typeConfig.task;
  return (
    <span className={`inline-flex items-center text-xs border rounded px-1.5 py-0.5 ${cfg.color}`}>
      {type}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: number }) {
  const cfg = priorityConfig[priority] ?? priorityConfig[4];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${cfg.color}`}>
      <span>●</span> {cfg.label}
    </span>
  );
}
