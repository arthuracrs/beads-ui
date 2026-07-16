import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import type { Stats, Status, IssueType } from "./types";
import { IssueModel } from "./models/IssueModel";
import { Sidebar, type View } from "./components/Sidebar";
import { IssueRow } from "./components/IssueRow";
import { KanbanBoard } from "./components/KanbanBoard";
import { IssueDetail } from "./components/IssueDetail";
import { ExecutionView } from "./components/ExecutionView";
import { FormulasView } from "./components/FormulasView";
import { DependencyGraphView } from "./components/DependencyGraphView";
import { StatsBar } from "./components/StatsBar";

const NON_ISSUE_VIEWS = new Set(["sessions", "formulas", "graph"]);

type Layout = "list" | "board";

const viewLabel: Record<View, string> = {
  all: "All Issues",
  ready: "Ready to Work",
  sessions: "Sessions",
  formulas: "Formulas",
  graph: "Dependency Graph",
};

const statusFilters: { value: Status; label: string; icon: string }[] = [
  { value: "open", label: "Open", icon: "○" },
  { value: "in_progress", label: "In Progress", icon: "◐" },
  { value: "blocked", label: "Blocked", icon: "●" },
  { value: "deferred", label: "Deferred", icon: "❄" },
  { value: "closed", label: "Closed", icon: "✓" },
];

const typeFilters: { value: IssueType; label: string; color: string }[] = [
  { value: "bug", label: "Bug", color: "var(--red)" },
  { value: "feature", label: "Feature", color: "var(--green)" },
  { value: "task", label: "Task", color: "var(--text-muted)" },
  { value: "epic", label: "Epic", color: "var(--purple)" },
  { value: "chore", label: "Chore", color: "var(--text-muted)" },
];

export default function App() {
  const [view, setView] = useState<View>("all");
  const [layout, setLayout] = useState<Layout>("list");
  const [issues, setIssues] = useState<IssueModel[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [typeFilter, setTypeFilter] = useState<IssueType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [initializing, setInitializing] = useState(false);

  const loadIssues = useCallback(async (opts?: { silent?: boolean }) => {
    if (NON_ISSUE_VIEWS.has(view)) return;
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      let data: IssueModel[];
      if (view === "ready") {
        data = (await api.issues.ready()).map(IssueModel.from);
      } else {
        const params: Record<string, string> = {};
        if (statusFilter) params.status = statusFilter;
        if (typeFilter) params.type = typeFilter;
        if (search) params.search = search;
        data = (await api.issues.list(Object.keys(params).length > 0 ? params : undefined)).map(IssueModel.from);
      }
      setIssues(data);
      if (silent) setError("");
    } catch (err: unknown) {
      if (!silent) {
        setError((err as Error).message);
        setIssues([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [view, search, statusFilter, typeFilter]);

  const loadStats = useCallback(async () => {
    try {
      const s = await api.issues.stats();
      setStats(s);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    api.initStatus().then(({ initialized }) => setInitialized(initialized));
  }, []);

  useEffect(() => {
    if (initialized) {
      loadIssues();
      loadStats();
    }
  }, [initialized, loadIssues, loadStats]);

  useEffect(() => {
    if (!initialized) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      loadIssues({ silent: true });
      loadStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [initialized, loadIssues, loadStats]);

  async function handleInit() {
    setInitializing(true);
    try {
      await api.init();
      setInitialized(true);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setInitializing(false);
    }
  }

  function handleViewChange(v: View) {
    setView(v);
    setSearch("");
    setStatusFilter(null);
    setTypeFilter(null);
  }

  function handleUpdated() {
    loadIssues();
    loadStats();
  }

  if (initialized === null) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--text-muted)]">
        Connecting…
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="text-4xl">◎</div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Beads not initialized</h1>
        <p className="max-w-sm text-center text-sm text-[var(--text-muted)]">
          No Beads database found. Initialize one in the current directory to get started.
        </p>
        <button
          onClick={handleInit}
          disabled={initializing}
          className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--bg)] disabled:opacity-50 hover:opacity-90"
        >
          {initializing ? "Initializing…" : "Initialize Beads"}
        </button>
        <p className="text-xs text-[var(--text-muted)]">
          Runs <code className="font-mono bg-[var(--surface2)] px-1 py-0.5 rounded">bd init</code> in the current directory.
        </p>
      </div>
    );
  }

  const showKanban = layout === "board" && view !== "ready";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar view={view} onView={handleViewChange} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
          <h1 className="text-sm font-semibold text-[var(--text)] shrink-0">
            {viewLabel[view]}
          </h1>

          {view !== "ready" && !NON_ISSUE_VIEWS.has(view) && (
            <input
              className="flex-1 max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}

          {!NON_ISSUE_VIEWS.has(view) && view !== "ready" && (
            <>
              <div className="flex items-center gap-1">
                {statusFilters.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(statusFilter === f.value ? null : f.value)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                      statusFilter === f.value
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                    }`}
                  >
                    <span>{f.icon}</span>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {typeFilters.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setTypeFilter(typeFilter === f.value ? null : f.value)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                      typeFilter === f.value
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                    }`}
                  >
                    <span style={{ color: f.color }}>●</span>
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-3">
            <StatsBar stats={stats} />

            {!NON_ISSUE_VIEWS.has(view) && (
              <div className="flex rounded-md border border-[var(--border)] overflow-hidden">
                <button
                  onClick={() => setLayout("list")}
                  title="List view"
                  className={`px-2.5 py-1.5 text-sm transition-colors ${
                    layout === "list"
                      ? "bg-[var(--surface2)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  ≡
                </button>
                <button
                  onClick={() => setLayout("board")}
                  title="Board view"
                  className={`px-2.5 py-1.5 text-sm transition-colors border-l border-[var(--border)] ${
                    layout === "board"
                      ? "bg-[var(--surface2)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  ⊞
                </button>
              </div>
            )}

            <button
              onClick={() => setSelectedId("__new__")}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--bg)] hover:opacity-90 transition-opacity"
            >
              + New
            </button>
            <button
              onClick={() => { loadIssues(); loadStats(); }}
              className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm transition-colors"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {view === "sessions" && (
          <div className="flex flex-1 items-center justify-center text-[var(--text-muted)] text-sm">
            Sessions view is not available in this version.
          </div>
        )}

        {view === "formulas" && <FormulasView />}

        {view === "graph" && <DependencyGraphView onSelectIssue={setSelectedId} />}

        {!NON_ISSUE_VIEWS.has(view) && loading && (
          <div className="flex flex-1 items-center justify-center text-[var(--text-muted)] text-sm">
            Loading…
          </div>
        )}

        {!NON_ISSUE_VIEWS.has(view) && !loading && error && (
          <div className="m-5 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 p-4 text-sm text-[var(--red)]">
            {error}
          </div>
        )}

        {!NON_ISSUE_VIEWS.has(view) && !loading && !error && issues.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
            <span className="text-2xl">○</span>
            <span className="text-sm">No issues found</span>
            {view === "ready" && (
              <span className="text-xs">All tasks have open blockers or are closed.</span>
            )}
          </div>
        )}

        {!NON_ISSUE_VIEWS.has(view) && !loading && !error && issues.length > 0 && (
          showKanban ? (
            <div className="flex-1 overflow-hidden">
              <KanbanBoard issues={issues} onSelect={setSelectedId} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3 text-xs text-[var(--text-muted)]">
                {issues.length} issue{issues.length !== 1 ? "s" : ""}
              </div>
              <div className="space-y-2">
                {issues.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    onClick={() => setSelectedId(issue.id)}
                  />
                ))}
              </div>
            </div>
          )
        )}
      </main>

      {selectedId && (
        <IssueDetail
          issueId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={handleUpdated}
          onOpenExecution={(id) => setSelectedExecutionId(id)}
          onSelectIssue={(id) => setSelectedId(id)}
        />
      )}

      {selectedExecutionId && (
        <ExecutionView
          executionId={selectedExecutionId}
          onClose={() => setSelectedExecutionId(null)}
        />
      )}
    </div>
  );
}
