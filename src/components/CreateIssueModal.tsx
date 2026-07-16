import { useState } from "react";
import { api } from "../api";
import type { Issue, IssueType } from "../types";

interface Props {
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}

const types: IssueType[] = ["task", "bug", "feature", "epic", "chore"];

export function CreateIssueModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<IssueType>("task");
  const [priority, setPriority] = useState(2);
  const [assignee, setAssignee] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    try {
      const issue = await api.issues.create({
        title: title.trim(),
        description: description.trim() || undefined,
        issue_type: type,
        priority,
        assignee: assignee.trim() || undefined,
      } as Record<string, unknown> as any);
      onCreated(issue);
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
        <h2 className="mb-5 text-base font-semibold text-[var(--text)]">Create Issue</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Title *</label>
            <input
              autoFocus
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
              placeholder="Short, descriptive title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Description</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Type</label>
              <select
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                value={type}
                onChange={(e) => setType(e.target.value as IssueType)}
              >
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Priority</label>
              <select
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              >
                <option value={0}>P0 — Critical</option>
                <option value={1}>P1 — High</option>
                <option value={2}>P2 — Medium</option>
                <option value={3}>P3 — Low</option>
                <option value={4}>P4 — Backlog</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Assignee</label>
            <input
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
              placeholder="Username or email (optional)"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md bg-[var(--red)]/10 px-3 py-2 text-xs text-[var(--red)]">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
