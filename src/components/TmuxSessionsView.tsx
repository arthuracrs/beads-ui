import { useState, useEffect } from "react";
import { api } from "../api";
import type { AgentExecution } from "../types";
import { ExecutionModel } from "../models/ExecutionModel";

interface Props {
  onOpenSession: (execId: string) => void;
}

function statusIcon(status: AgentExecution["status"]) {
  if (status === "running") return <span className="text-[var(--green)]">◐</span>;
  if (status === "completed") return <span className="text-[var(--text-muted)]">✓</span>;
  if (status === "failed") return <span className="text-[var(--red)]">✗</span>;
  return <span className="text-[var(--text-muted)]">○</span>;
}

function statusLabel(status: AgentExecution["status"]) {
  if (status === "running") return "running";
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  return "cancelled";
}

export function TmuxSessionsView({ onOpenSession }: Props) {
  const [sessions, setSessions] = useState<AgentExecution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await api.tmux.list();
        if (mounted) {
          setSessions(data);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 2000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-[var(--text-muted)]">
          {loading ? "Loading…" : `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <span className="text-3xl text-[var(--text-muted)]">▣</span>
          <p className="text-sm text-[var(--text-muted)]">No tmux sessions</p>
          <p className="text-xs text-[var(--text-muted)] max-w-xs">
            Start one by opening an issue and running it with the <strong>Claude (tmux)</strong> runtime.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {sessions.map((exec) => {
          const model = ExecutionModel.from(exec);
          return (
            <div
              key={exec.id}
              className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]/40 transition-colors"
            >
              <div className="text-base">{statusIcon(exec.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[var(--text-muted)] shrink-0">{exec.issueId}</span>
                  <span className="text-sm text-[var(--text)] truncate">
                    {exec.tmuxSession ?? exec.id}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span className={exec.status === "running" ? "text-[var(--green)]" : ""}>
                    {statusLabel(exec.status)}
                  </span>
                  <span>·</span>
                  <span>{model.elapsed()}</span>
                  {exec.tmuxSession && (
                    <>
                      <span>·</span>
                      <span className="font-mono truncate max-w-[200px]">{exec.tmuxSession}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => onOpenSession(exec.id)}
                className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs text-[var(--text)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)] transition-colors"
              >
                Open
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
