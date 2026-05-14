import { useState, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { api } from "../api";
import type { AgentExecution } from "../types";
import { AgentViewHeader } from "./AgentViewHeader";

interface Props {
  executionId: string;
  onClose: () => void;
}

export function TmuxSessionView({ executionId, onClose }: Props) {
  const [exec, setExec] = useState<AgentExecution | null>(null);
  const [paneData, setPaneData] = useState("");
  const [copied, setCopied] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Load initial exec metadata
  useEffect(() => {
    api.tmux.list().then((all) => {
      const found = all.find((e) => e.id === executionId);
      if (found) setExec(found);
    }).catch(() => {});
  }, [executionId]);

  // Poll exec status for header updates
  useEffect(() => {
    const interval = setInterval(() => {
      api.tmux.list().then((all) => {
        const found = all.find((e) => e.id === executionId);
        if (found) setExec(found);
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [executionId]);

  // Mount xterm.js
  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      cols: 220,
      rows: 50,
      theme: {
        background: "#010409",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
        selectionBackground: "#264f78",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 3000,
    });

    term.loadAddon(new WebLinksAddon());
    term.open(termRef.current);

    xtermRef.current = term;

    return () => {
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Connect SSE pane stream
  useEffect(() => {
    const apiBase = import.meta.env.DEV ? "http://localhost:3001" : "";
    const es = new EventSource(`${apiBase}/api/executions/${executionId}/pane`);
    esRef.current = es;

    let lastData = "";
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { type: string; data?: string; status?: string };
      if (msg.type === "pane" && msg.data && xtermRef.current) {
        if (msg.data !== lastData) {
          lastData = msg.data;
          setPaneData(msg.data);
          xtermRef.current.reset();
          // capture-pane outputs \n; xterm.js needs \r\n or it staircases each line
          xtermRef.current.write(msg.data.replace(/\r?\n/g, "\r\n"));
        }
      }
      if (msg.type === "done") {
        es.close();
        // Update local exec status
        setExec((prev) => prev ? { ...prev, status: (msg.status ?? "completed") as AgentExecution["status"] } : prev);
      }
    };

    return () => es.close();
  }, [executionId]);

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCopyAttach = () => {
    if (!exec?.tmuxSession) return;
    navigator.clipboard.writeText(`tmux attach -t ${exec.tmuxSession}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const currentStatus = exec?.status ?? "running";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#010409]">
      <AgentViewHeader
        id={exec?.issueId ?? executionId}
        status={currentStatus}
        onClose={onClose}
        meta={exec?.tmuxSession}
        actions={exec?.tmuxSession ? (
          <button
            onClick={handleCopyAttach}
            title={`Copy: tmux attach -t ${exec.tmuxSession}`}
            className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            {copied ? "Copied!" : "⎋ Attach cmd"}
          </button>
        ) : undefined}
      />

      {/* Terminal — fixed at tmux pane dimensions (220×50), scrolls if viewport is narrower */}
      <div className="flex-1 overflow-auto bg-[#010409]">
        <div
          ref={termRef}
          style={{ padding: "8px", width: "max-content" }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-2 text-xs text-[var(--text-muted)]">
        <span>{paneData.split("\n").length} lines · {(new Blob([paneData]).size / 1024).toFixed(1)} KB</span>
        <span className="ml-auto">Press Esc to close</span>
      </div>
    </div>
  );
}
