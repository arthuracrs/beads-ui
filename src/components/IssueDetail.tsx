import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { IssueModel } from "../models/IssueModel";
import { IssueDetailView } from "./IssueDetailView";
import { AgentsPanel } from "./AgentsPanel";
import { DependencyGraphView } from "./DependencyGraphView";

interface Props {
  issueId: string;
  onClose: () => void;
  onUpdated: () => void;
  onOpenExecution: (id: string) => void;
  onSelectIssue?: (id: string) => void;
}

export function IssueDetail({ issueId, onClose, onUpdated, onOpenExecution, onSelectIssue }: Props) {
  const [issue, setIssue] = useState<IssueModel | null>(null);
  const [activeTab, setActiveTab] = useState<string>("details");
  const [loading, setLoading] = useState(true);

  const loadIssue = useCallback(async () => {
    setLoading(true);
    try {
      if (issueId === "__new__") {
        setIssue(null);
        setLoading(false);
        return;
      }
      const data = await api.issues.get(issueId);
      setIssue(IssueModel.from(data));
    } catch { /* ignore */ }
    setLoading(false);
  }, [issueId]);

  useEffect(() => {
    loadIssue();
  }, [loadIssue]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--bg)]/80">
        <div className="text-[var(--text-muted)] animate-pulse">Loading…</div>
      </div>
    );
  }

  if (issueId === "__new__") {
    return (
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-[var(--bg)]" onClick={onClose} />
        <CreateIssueForm onCreated={() => { onUpdated(); onClose(); }} onClose={onClose} />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--bg)]/80">
        <div className="text-[var(--red)]">Issue not found</div>
      </div>
    );
  }

  const tabs = [
    { id: "details", label: "Details" },
    { id: "agents", label: "Agents" },
    { id: "graph", label: "Graph" },
  ];

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-[520px] max-w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl">
        {/* Tab bar */}
        <div className="sticky top-0 z-10 flex items-center border-b border-[var(--border)] bg-[var(--surface)] px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--accent)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={onClose}
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)] text-sm"
          >
            ×
          </button>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === "details" && (
            <IssueDetailView issue={issue} onUpdated={onUpdated} onClose={onClose} />
          )}
          {activeTab === "agents" && (
            <AgentsPanel issue={issue} onOpenExecution={onOpenExecution} />
          )}
          {activeTab === "graph" && (
            <DependencyGraphView onSelectIssue={(id) => onSelectIssue?.(id)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CreateIssueForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("task");
  const [priority, setPriority] = useState(0);
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.issues.create({ title, description, issue_type: type, priority, assignee } as Record<string, unknown> as any);
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-[520px] max-w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
      <h2 className="mb-5 text-base font-semibold text-[var(--text)]">New Issue</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">Title</label>
          <input
            autoFocus
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">Description</label>
          <textarea
            rows={4}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Type</label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="chore">Chore</option>
              <option value="epic">Epic</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Priority</label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              <option value={0}>None</option>
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
              <option value={4}>Critical</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Assignee</label>
            <input
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50">Create</button>
        </div>
      </form>
    </div>
  );
}
