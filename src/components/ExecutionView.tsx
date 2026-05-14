import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ExecStatus } from "../types";
import { AgentViewHeader } from "./AgentViewHeader";

interface Props {
  executionId: string;
  onClose: () => void;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

export function ExecutionView({ executionId, onClose }: Props) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<ExecStatus>("running");
  const [cancelling, setCancelling] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]">
      <AgentViewHeader
        id={executionId}
        status={status}
        onClose={onClose}
        actions={status === "running" ? (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-md border border-[var(--red)]/40 bg-[var(--red)]/10 px-3 py-1 text-xs text-[var(--red)] hover:bg-[var(--red)]/20 transition-colors disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        ) : undefined}
      />

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
        <span className="ml-auto">Press Esc to close</span>
      </div>
    </div>
  );
}
