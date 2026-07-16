import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { IssueModel } from "../models/IssueModel";
import { ExecutionModel } from "../models/ExecutionModel";
import type { AgentTrigger, ExecStatus } from "../types";
import { RunAgentModal, DEFAULT_PROMPT } from "./RunAgentModal";

interface Props {
  issue: IssueModel;
  onOpenExecution: (id: string) => void;
}

const statusIcon: Record<ExecStatus, string> = {
  running:   "◐",
  completed: "✓",
  failed:    "✗",
  cancelled: "○",
};
const statusColor: Record<ExecStatus, string> = {
  running:   "text-[var(--yellow)]",
  completed: "text-[var(--green)]",
  failed:    "text-[var(--red)]",
  cancelled: "text-[var(--text-muted)]",
};

// ── Add Trigger modal ─────────────────────────────────────────────────────────
interface TriggerModalProps {
  issueId: string;
  onClose: () => void;
  onCreated: (t: AgentTrigger) => void;
}

const DEFAULT_CMD = `Validate and test the result for issue {id}: {title}`;

function AddTriggerModal({ issueId, onClose, onCreated }: TriggerModalProps) {
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<AgentTrigger["condition"]>("execution_completed");
  const [command, setCommand] = useState(DEFAULT_CMD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;
    setLoading(true);
    setError("");
    try {
      const trigger = await api.triggers.create({ issueId, name, condition, command, enabled: true });
      onCreated(trigger);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-base font-semibold text-[var(--text)]">Add Trigger</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Trigger name</label>
            <input
              autoFocus
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              placeholder="e.g. Run validator after agent finishes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">When</label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={condition}
              onChange={(e) => setCondition(e.target.value as AgentTrigger["condition"])}
            >
              <option value="execution_completed">Agent run completes successfully</option>
              <option value="execution_failed">Agent run fails</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Then run command</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 font-mono text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] resize-none"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Variables: <code>{"{id}"}</code> <code>{"{title}"}</code> <code>{"{description}"}</code>
            </p>
          </div>
          {error && (
            <p className="rounded-md bg-[var(--red)]/10 px-3 py-2 text-xs text-[var(--red)]">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50 hover:opacity-90">
              {loading ? "Adding…" : "Add Trigger"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main AgentsPanel ──────────────────────────────────────────────────────────
export function AgentsPanel({ issue, onOpenExecution }: Props) {
  const [executions, setExecutions] = useState<ExecutionModel[]>([]);
  const [triggers, setTriggers] = useState<AgentTrigger[]>([]);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"runs" | "triggers">("runs");
  const [quickRunning, setQuickRunning] = useState(false);

  // Per-issue runtime preference
  const storageKey = `beads-ui:runtime:${issue.id}`;
  const storedPref = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
  const [prefRuntime] = useState(storedPref || "opencode");

  const loadExecutions = useCallback(async () => {
    try {
      const data = await api.executions.list(issue.id);
      setExecutions(data.map(ExecutionModel.from));
    } catch { /* non-critical */ }
  }, [issue.id]);

  const loadTriggers = useCallback(async () => {
    try {
      const data = await api.triggers.list(issue.id);
      setTriggers(data);
    } catch { /* non-critical */ }
  }, [issue.id]);

  useEffect(() => {
    loadExecutions();
    loadTriggers();
    const interval = setInterval(loadExecutions, 2000);
    return () => clearInterval(interval);
  }, [loadExecutions, loadTriggers]);

  async function toggleTrigger(t: AgentTrigger) {
    try {
      const updated = await api.triggers.update(t.id, { enabled: !t.enabled });
      setTriggers((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch { /* ignore */ }
  }

  async function deleteTrigger(id: string) {
    try {
      await api.triggers.delete(id);
      setTriggers((prev) => prev.filter((t) => t.id !== id));
    } catch { /* ignore */ }
  }

  async function handleQuickRun() {
    setQuickRunning(true);
    try {
      const exec = await api.executions.start(issue.id, prefRuntime, DEFAULT_PROMPT, "headless");
      setExecutions((prev) => [ExecutionModel.from(exec), ...prev]);
      onOpenExecution(exec.id);
    } catch { /* modal path available via ⚙ for retry */ }
    finally { setQuickRunning(false); }
  }

  return (
    <section>
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-md border border-[var(--border)] overflow-hidden text-xs">
          <button
            onClick={() => setActiveTab("runs")}
            className={`px-3 py-1.5 transition-colors ${activeTab === "runs" ? "bg-[var(--surface2)] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
          >
            Runs {executions.length > 0 && <span className="ml-1 text-[var(--text-muted)]">({executions.length})</span>}
          </button>
          <button
            onClick={() => setActiveTab("triggers")}
            className={`px-3 py-1.5 border-l border-[var(--border)] transition-colors ${activeTab === "triggers" ? "bg-[var(--surface2)] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
          >
            Triggers {triggers.length > 0 && <span className="ml-1 text-[var(--text-muted)]">({triggers.length})</span>}
          </button>
        </div>

        {activeTab === "runs" ? (
          <div className="flex items-center">
            <button
              onClick={handleQuickRun}
              disabled={quickRunning}
              className="rounded-l-md bg-[var(--green)]/15 border border-[var(--green)]/30 px-3 py-1 text-xs text-[var(--green)] hover:bg-[var(--green)]/25 transition-colors disabled:opacity-50"
            >
              {quickRunning ? "Starting…" : "▶ Run Agent"}
            </button>
            <button
              onClick={() => setShowRunModal(true)}
              className="rounded-r-md bg-[var(--green)]/15 border border-[var(--green)]/30 border-l-0 px-2 py-1 text-xs text-[var(--green)] hover:bg-[var(--green)]/25 transition-colors"
              title="Configure run options"
            >
              ⚙
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowTriggerModal(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            + Add Trigger
          </button>
        )}
      </div>

      {/* Runs tab */}
      {activeTab === "runs" && (
        <div className="space-y-1.5">
          {executions.length === 0 && (
            <div className="flex h-16 items-center justify-center text-xs text-[var(--text-muted)] rounded-lg border border-dashed border-[var(--border)]">
              No runs yet — click Run Agent to start one
            </div>
          )}
          {executions.map((exec) => (
            <button
              key={exec.id}
              onClick={() => onOpenExecution(exec.id)}
              className="group w-full flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5 text-left hover:border-[var(--accent)]/40 transition-all"
            >
              <span className={`text-sm shrink-0 ${statusColor[exec.status]}`}>
                {statusIcon[exec.status]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate font-mono text-xs text-[var(--text)]">{exec.runtimeId ?? exec.mode}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[var(--text-muted)]">{exec.timeAgo()}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">·</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{exec.elapsed()}</span>
                  {exec.isTriggered() && (
                    <>
                      <span className="text-[10px] text-[var(--text-muted)]">·</span>
                      <span className="text-[10px] text-[var(--accent)]">triggered</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                View →
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Triggers tab */}
      {activeTab === "triggers" && (
        <div className="space-y-1.5">
          {triggers.length === 0 && (
            <div className="flex h-16 items-center justify-center text-xs text-[var(--text-muted)] rounded-lg border border-dashed border-[var(--border)]">
              No triggers yet — add one to chain agents automatically
            </div>
          )}
          {triggers.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5">
              <button
                onClick={() => toggleTrigger(t)}
                className={`mt-0.5 shrink-0 w-7 h-4 rounded-full transition-colors relative ${t.enabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
                title={t.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
              >
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${t.enabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text)]">{t.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  When <span className="text-[var(--accent)]">{t.condition === "execution_completed" ? "run completes" : "run fails"}</span> →{" "}
                  <span className="font-mono">{t.command.slice(0, 50)}{t.command.length > 50 ? "…" : ""}</span>
                </p>
              </div>
              <button
                onClick={() => deleteTrigger(t.id)}
                className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors text-xs shrink-0"
                title="Delete trigger"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showRunModal && (
        <RunAgentModal
          issue={issue}
          onClose={() => setShowRunModal(false)}
          onStarted={(exec) => {
            setShowRunModal(false);
            setExecutions((prev) => [ExecutionModel.from(exec), ...prev]);
            onOpenExecution(exec.id);
          }}
        />
      )}

      {showTriggerModal && (
        <AddTriggerModal
          issueId={issue.id}
          onClose={() => setShowTriggerModal(false)}
          onCreated={(t) => {
            setShowTriggerModal(false);
            setTriggers((prev) => [...prev, t]);
          }}
        />
      )}
    </section>
  );
}
