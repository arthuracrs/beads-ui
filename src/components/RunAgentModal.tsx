import { useState, useEffect } from "react";
import { api } from "../api";
import type { IssueModel } from "../models/IssueModel";
import type { AgentExecution, AgentRuntime } from "../types";

interface Props {
  issue: IssueModel;
  onClose: () => void;
  onStarted: (exec: AgentExecution) => void;
}

export const DEFAULT_PROMPT = `Work on beads issue {id} (full context already prepended above). Complete the task using only the information available. Do not ask for more information. If you need more information from a person, leave a comment on the issue with specific instructions on what information you need and don't move the issue to done.

Before starting work:
1. Run: bd update {id} --actor agent --status in_progress

When done:
1. Run: bd comment {id} --actor agent "<brief summary of what was done and proof of completion>"
2. Leave the issue open for review.`;

function RuntimeIcon({ id }: { id: string }) {
  if (id === "claude-code") return <span className="text-[var(--purple)]">◎</span>;
  if (id === "opencode") return <span className="text-[var(--accent)]">◈</span>;
  if (id === "cursor") return <span className="text-[var(--accent)]">⌥</span>;
  return <span className="text-[var(--text-muted)]">▸</span>;
}

export function RunAgentModal({ issue, onClose, onStarted }: Props) {
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([]);
  const [runtimeId, setRuntimeId] = useState("");
  const [mode, setMode] = useState<"headless" | "tmux">("headless");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.runtimes.list().then((rts) => {
      setRuntimes(rts);
      if (rts.length > 0 && !runtimeId) setRuntimeId(rts[0].id);
    }).catch(() => {});
  }, []);

  const runtime = runtimes.find((r) => r.id === runtimeId);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!runtime || !prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      const exec = await api.executions.start(issue.id, runtime.id, prompt, mode);
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
        <div className="mb-4">
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
        </div>

        {/* Mode toggle */}
        <div className="mb-4">
          <label className="mb-2 block text-xs text-[var(--text-muted)]">Mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("headless")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                mode === "headless"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--surface2)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
              }`}
            >
              <span>◉ Headless</span>
              <span className="text-[10px] text-[var(--text-muted)]">Live streaming</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("tmux")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                mode === "tmux"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--surface2)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
              }`}
              title="Run in a tmux session — watch and intervene from your terminal"
            >
              <span>◰ Interactive</span>
              <span className="text-[10px] text-[var(--text-muted)]">tmux session</span>
            </button>
          </div>
        </div>

        {/* Prompt input */}
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
            The output of <code>bd show {issue.id}</code> is fetched server-side and passed as system prompt.
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
