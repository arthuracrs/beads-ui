import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { Status, IssueType } from "../types";
import { IssueModel } from "../models/IssueModel";
import { StatusBadge, TypeBadge, PriorityBadge } from "./Badge";
import { AgentsPanel } from "./AgentsPanel";

interface Props {
  issueId: string;
  onClose: () => void;
  onUpdated: () => void;
  onOpenExecution: (id: string) => void;
}

const statuses: Status[] = ["open", "in_progress", "blocked", "deferred", "closed"];
const types: IssueType[] = ["task", "bug", "feature", "epic", "chore"];

export function IssueDetail({ issueId, onClose, onUpdated, onOpenExecution }: Props) {
  const [issue, setIssue] = useState<IssueModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await api.issues.get(issueId);
      setIssue(IssueModel.from(data));
    } catch (err: unknown) {
      if (!silent) setError((err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    load();
    // Silent background poll catches updates from agent runs / external CLI changes.
    const interval = setInterval(() => {
      if (document.hidden) return;
      load({ silent: true });
    }, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function updateField(patch: Partial<IssueModel>) {
    if (!issue) return;
    setActionLoading(true);
    try {
      const updated = await api.issues.update(issue.id, patch);
      setIssue(IssueModel.from(updated));
      onUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaim() {
    if (!issue) return;
    setActionLoading(true);
    try {
      const updated = await api.issues.claim(issue.id);
      setIssue(IssueModel.from(updated));
      onUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClose() {
    if (!issue) return;
    setActionLoading(true);
    try {
      const updated = await api.issues.close(issue.id, closeReason || undefined);
      setIssue(IssueModel.from(updated));
      setShowCloseForm(false);
      onUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReopen() {
    if (!issue) return;
    setActionLoading(true);
    try {
      const updated = await api.issues.reopen(issue.id);
      setIssue(IssueModel.from(updated));
      onUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!issue || !comment.trim()) return;
    setCommenting(true);
    try {
      await api.issues.comment(issue.id, comment.trim());
      setComment("");
      await load();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setCommenting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {loading && (
          <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
            Loading…
          </div>
        )}
        {error && (
          <div className="p-6 text-[var(--red)]">{error}</div>
        )}
        {issue && (
          <div className="p-6">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-[var(--text-muted)]">{issue.id}</span>
                  <PriorityBadge priority={issue.priority} />
                  <TypeBadge type={issue.issue_type} />
                  <StatusBadge status={issue.status} />
                </div>
                <h2 className="text-base font-semibold text-[var(--text)] leading-snug">{issue.title}</h2>
              </div>
              <button onClick={onClose} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none">×</button>
            </div>

            {/* Metadata grid */}
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 text-xs">
              <Field label="Status">
                <select
                  className="bg-transparent text-[var(--text)] outline-none"
                  value={issue.status}
                  onChange={(e) => updateField({ status: e.target.value as Status })}
                  disabled={actionLoading}
                >
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select
                  className="bg-transparent text-[var(--text)] outline-none"
                  value={issue.issue_type}
                  onChange={(e) => updateField({ issue_type: e.target.value as IssueType })}
                  disabled={actionLoading}
                >
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  className="bg-transparent text-[var(--text)] outline-none"
                  value={issue.priority}
                  onChange={(e) => updateField({ priority: Number(e.target.value) })}
                  disabled={actionLoading}
                >
                  {[0,1,2,3,4].map((p) => <option key={p} value={p}>P{p}</option>)}
                </select>
              </Field>
              <Field label="Assignee">
                <span className="text-[var(--text)]">{issue.assignee || <span className="text-[var(--text-muted)]">—</span>}</span>
              </Field>
              <Field label="Created">{issue.createdFmt()}</Field>
              <Field label="Updated">{issue.updatedFmt()}</Field>
              {issue.closed_at && <Field label="Closed">{issue.closedFmt()}</Field>}
              {issue.close_reason && <Field label="Close reason">{issue.close_reason}</Field>}
            </div>

            {/* Description */}
            {issue.description && (
              <section className="mb-4">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Description</h3>
                <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{issue.description}</p>
              </section>
            )}

            {/* Labels */}
            {issue.labels && issue.labels.length > 0 && (
              <section className="mb-4">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Labels</h3>
                <div className="flex flex-wrap gap-1.5">
                  {issue.labels.map((l) => (
                    <span key={l} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{l}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Dependencies */}
            {issue.dependencies && issue.dependencies.length > 0 && (
              <section className="mb-4">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Dependencies</h3>
                <div className="space-y-1">
                  {issue.dependencies.map((dep) => (
                    <div key={dep.id} className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs">
                      <span className="font-mono text-[var(--text-muted)]">{dep.id}</span>
                      <span className="text-[var(--accent)]">{dep.dep_type}</span>
                      {dep.title && <span className="text-[var(--text)] truncate">{dep.title}</span>}
                      {dep.status && <StatusBadge status={dep.status} />}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Actions */}
            <section className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {!issue.isClosed() && (
                  <>
                    <button
                      onClick={handleClaim}
                      disabled={actionLoading}
                      className="rounded-md border border-[var(--yellow)]/40 bg-[var(--yellow)]/10 px-3 py-1.5 text-xs text-[var(--yellow)] hover:bg-[var(--yellow)]/20 transition-colors disabled:opacity-50"
                    >
                      Claim
                    </button>
                    {showCloseForm ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                          placeholder="Reason (optional)"
                          value={closeReason}
                          onChange={(e) => setCloseReason(e.target.value)}
                        />
                        <button
                          onClick={handleClose}
                          disabled={actionLoading}
                          className="rounded-md border border-[var(--red)]/40 bg-[var(--red)]/10 px-3 py-1.5 text-xs text-[var(--red)] hover:bg-[var(--red)]/20 transition-colors disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button onClick={() => setShowCloseForm(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCloseForm(true)}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                      >
                        Close
                      </button>
                    )}
                  </>
                )}
                {issue.isClosed() && (
                  <button
                    onClick={handleReopen}
                    disabled={actionLoading}
                    className="rounded-md border border-[var(--green)]/40 bg-[var(--green)]/10 px-3 py-1.5 text-xs text-[var(--green)] hover:bg-[var(--green)]/20 transition-colors disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </section>

            {/* Agent Runs */}
            <section className="mb-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Agents</h3>
              <AgentsPanel issue={issue} onOpenExecution={onOpenExecution} />
            </section>

            {/* Comments */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Comments {issue.commentCount() > 0 ? `(${issue.commentCount()})` : ""}
              </h3>
              {issue.commentCount() > 0 && (
                <div className="mb-3 space-y-2">
                  {issue.comments!.map((c) => (
                    <div key={c.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
                      <div className="mb-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        {c.author && <span>@{c.author}</span>}
                        <span>{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || commenting}
                  className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-[var(--bg)] disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {commenting ? "…" : "Post"}
                </button>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[var(--text-muted)] mb-0.5">{label}</div>
      <div className="text-[var(--text)]">{children}</div>
    </div>
  );
}
