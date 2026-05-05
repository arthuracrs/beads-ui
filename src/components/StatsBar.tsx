import type { Stats } from "../types";

interface Props {
  stats: Stats | null;
}

export function StatsBar({ stats }: Props) {
  const s = stats?.summary;
  if (!s) return null;

  const items = [
    { label: "Open",        value: s.open_issues,        color: "text-[var(--text-muted)]" },
    { label: "In Progress", value: s.in_progress_issues,  color: "text-[var(--yellow)]" },
    { label: "Blocked",     value: s.blocked_issues,      color: "text-[var(--red)]" },
    { label: "Ready",       value: s.ready_issues,        color: "text-[var(--green)]" },
    { label: "Total",       value: s.total_issues,        color: "text-[var(--text)]" },
  ].filter((i) => i.value !== undefined);

  return (
    <div className="flex items-center gap-4">
      {items.map((item) => (
        <div key={item.label} className="text-right">
          <div className={`text-sm font-semibold tabular-nums ${item.color}`}>{item.value}</div>
          <div className="text-[10px] text-[var(--text-muted)]">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
