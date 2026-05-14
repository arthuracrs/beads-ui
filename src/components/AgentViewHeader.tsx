import type { ExecStatus } from "../types";

const statusStyle: Record<ExecStatus, string> = {
  running:   "text-[var(--yellow)] border-[var(--yellow)]/30",
  completed: "text-[var(--green)] border-[var(--green)]/30",
  failed:    "text-[var(--red)] border-[var(--red)]/30",
  cancelled: "text-[var(--text-muted)] border-[var(--border)]",
};

const statusIcon: Record<ExecStatus, string> = {
  running:   "◐",
  completed: "✓",
  failed:    "✗",
  cancelled: "○",
};

interface Props {
  id: string;
  status: ExecStatus;
  onClose: () => void;
  meta?: string;
  actions?: React.ReactNode;
}

export function AgentViewHeader({ id, status, onClose, meta, actions }: Props) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3 shrink-0">
      <button
        onClick={onClose}
        className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
      >
        ← Back
      </button>

      <div className="h-4 w-px bg-[var(--border)]" />

      <span className="font-mono text-xs text-[var(--text-muted)]">{id}</span>

      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${statusStyle[status]}`}>
        <span>{statusIcon[status]}</span>
        {status}
      </span>

      {meta && (
        <span className="font-mono text-xs text-[var(--text-muted)] truncate">{meta}</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {actions}
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
