import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AgentExecution, ExecStatus } from "../types";

interface Props {
  executionId: string;
  onClose: () => void;
}

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

function stripAnsi(str: string): string {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function elapsed(start: string, end?: string): string {
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function ExecutionView({ executionId, onClose }: Props) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<ExecStatus>("running");
  const [exec, setExec] = useState<AgentExecution | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [tick, setTick] = useState(0);
  const outputRef = useRef<HTMLPreElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // tick for elapsed time while running
  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    // Load execution metadata
    api.executions.list("").catch(() => null); // noop — we get exec data from SSE

    // Bypass Vite proxy for SSE — the proxy buffers the response body, breaking streaming
    const apiBase = import.meta.env.DEV ? "http://localhost:3001" : "";
    const es = new EventSource(`${apiBase}/api/executions/${executionId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { type: string; data?: string; status?: ExecStatus; exitCode?: number };
      if (msg.type === "output" && msg.data) {
        setOutput((prev) => prev + msg.data);
        // auto-scroll
        requestAnimationFrame(() => {
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        });
      }
      if (msg.type === "done" && msg.status) {
        setStatus(msg.status);
        es.close();
      }
    };

    es.onerror = () => {
      setStatus((s) => (s === "running" ? "failed" : s));
      es.close();
    };

    return () => es.close();
  }, [executionId]);

  // Load exec metadata once for display
  useEffect(() => {
    // We pull it from the list endpoint by issue — but we don't know the issueId here.
    // The SSE replay gives us output; for metadata we'll store a minimal shape in state as we go.
    // The exec object will be populated from the executions list by the parent if needed.
  }, []);

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.executions.cancel(executionId);
      setStatus("cancelled");
      esRef.current?.close();
    } finally {
      setCancelling(false);
    }
  }

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const _ = tick; // silence unused warning, used to force re-render for elapsed

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
        >
          ← Back
        </button>

        <div className="h-4 w-px bg-[var(--border)]" />

        <span className="font-mono text-xs text-[var(--text-muted)]">{executionId}</span>

        <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${statusStyle[status]}`}>
          <span>{statusIcon[status]}</span>
          {status}
          {status === "running" && (
            <span className="text-[var(--text-muted)]">
              · {exec ? elapsed(exec.startedAt) : "…"}
            </span>
          )}
        </span>

        {exec?.exitCode !== undefined && (
          <span className="text-xs text-[var(--text-muted)]">exit {exec.exitCode}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {status === "running" && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-md border border-[var(--red)]/40 bg-[var(--red)]/10 px-3 py-1 text-xs text-[var(--red)] hover:bg-[var(--red)]/20 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Terminal output */}
      <pre
        ref={outputRef}
        className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed text-[#e6edf3] whitespace-pre-wrap break-words"
        style={{ background: "#010409" }}
      >
        {output ? stripAnsi(output) : (
          <span className="text-[var(--text-muted)]">Waiting for output…</span>
        )}
        {status === "running" && <span className="animate-pulse">▌</span>}
      </pre>

      {/* Footer */}
      <div className="flex items-center gap-4 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-2 text-xs text-[var(--text-muted)]">
        <span>{output.split("\n").length} lines · {(new Blob([output]).size / 1024).toFixed(1)} KB</span>
        {status !== "running" && exec?.finishedAt && (
          <span>Finished in {elapsed(exec.startedAt, exec.finishedAt)}</span>
        )}
        <span className="ml-auto">Press Esc to close</span>
      </div>
    </div>
  );
}
