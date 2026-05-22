import { useState, useEffect } from "react";
import { api } from "../api";
import type { IssueModel } from "../models/IssueModel";
import type { AgentExecution, AgentRuntime } from "../types";

interface Props {
  issue: IssueModel;
  onClose: () => void;
  onStarted: (exec: AgentExecution) => void;
}

export const DEFAULT_PROMPT = `Work on beads issue {id} (full context already prepended above). Complete the task using only the information available. Do not ask for more information. If you need more information from a person, leave a comment on the issue with specific instructions on what information you need and dont move the issue to done.

When done:
1. Run: bd comment {id} "<brief summary of what was done and proof of completion>"
2. Run: bd close {id}`;

function RuntimeIcon({ id }: { id: string }) {
  if (id === "claude-code") return <span className="text-[var(--purple)]">◎</span>;
  if (id === "cursor") return <span className="text-[var(--accent)]">⌥</span>;
  return <span className="text-[var(--text-muted)]">▸</span>;
}

export function RunAgentModal({ issue, onClose, onStarted }: Props) {
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([]);
  const [runtimeId, setRuntimeId] = useState("anagent");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.runtimes.list().then(setRuntimes).catch(() => {});
  }, []);

  const runtime = runtimes.find((r) => r.id === runtimeId) ?? runtimes[0];

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!runtime || !prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      const exec = await api.executions.start(issue.id, runtime.id, prompt);
      onStarted(exec);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-base font-semibold text-[var(--text)]">Run Agent</h2>

        {/* Runtime picker */}
        <div className="mb-5">
          <label className="mb-2 block text-xs text-[var(--text-muted)]">Runtime</label>
          <div className="flex flex-wrap gap-2">
            {runtimes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRuntimeId(r.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                  runtimeId === r.id
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface2)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
                }`}
              >
                <RuntimeIcon id={r.id} />
                <span>{r.name}</span>
              </button>
            ))}
          </div>
          {runtime && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">
              Template: <code className="font-mono">{runtime.commandTemplate}</code>
            </p>
          )}
        </div>

        <form onSubmit={handleRun} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Prompt</label>
            <textarea
              autoFocus
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 font-mono text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Variables: <code>{"{id}"}</code> <code>{"{title}"}</code> <code>{"{description}"}</code> <code>{"{status}"}</code> <code>{"{priority}"}</code>
            </p>
          </div>

          <p className="text-[10px] text-[var(--text-muted)]">
            The output of <code>bd show {issue.id}</code> is fetched server-side and prepended to your prompt before the agent runs.
          </p>

          {error && (
            <p className="rounded-md bg-[var(--red)]/10 px-3 py-2 text-xs text-[var(--red)]">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !prompt.trim() || !runtime}
              className="rounded-md bg-[var(--green)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? "Starting…" : "▶ Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
