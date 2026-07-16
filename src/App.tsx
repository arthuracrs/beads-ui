import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import type { Issue } from "./types";
import { IssueModel } from "./models/IssueModel";
import { Sidebar } from "./components/Sidebar";
import { KanbanBoard } from "./components/KanbanBoard";
import { StatsBar } from "./components/StatsBar";
import { IssueDetail } from "./components/IssueDetail";
import { ExecutionView } from "./components/ExecutionView";
import "./index.css";

export default function App() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    try {
      const data = await api.issues.list();
      const sorted = data.sort((a, b) => {
        const aP = a.priority ?? 0;
        const bP = b.priority ?? 0;
        if (aP !== bP) return bP - aP;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setIssues(sorted);
      setError("");
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadIssues();
    const interval = setInterval(loadIssues, 5000);
    return () => clearInterval(interval);
  }, [loadIssues]);

  function handleUpdated() {
    loadIssues();
  }

  const filtered = issues.filter((i) => {
    if (statusFilter && i.status !== statusFilter) return false;
    if (typeFilter && i.issue_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.title.toLowerCase().includes(q) && !(i.description ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="app-container">
      <Sidebar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
      />

      <main className="main-content">
        <StatsBar issues={issues} />
        <div className="toolbar">
          <input
            type="text"
            placeholder="Search issues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <div className="toolbar-actions">
            <button
              onClick={() => setSelectedId("__new__")}
              className="btn-primary"
            >
              + New Issue
            </button>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <KanbanBoard
          issues={filtered.map((i) => IssueModel.from(i))}
          onSelect={(id) => setSelectedId(id)}
          onCreate={() => setSelectedId("__new__")}
        />
      </main>

      {selectedId && (
        <IssueDetail
          issueId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={handleUpdated}
          onOpenExecution={(id) => {
            setSelectedExecutionId(id);
          }}
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
