import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
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
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
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

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(termRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => fitRef.current?.fit());
    ro.observe(termRef.current);

    return () => {
      ro.disconnect();
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
          xtermRef.current.reset();
          xtermRef.current.write(msg.data);
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

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    try {
      await api.tmux.sendInput(executionId, inputText);
      setInputText("");
    } catch {
      // silently ignore
    } finally {
      setSending(false);
    }
  }, [executionId, inputText, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

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

      {/* Terminal */}
      <div
        ref={termRef}
        className="flex-1 overflow-hidden"
        style={{ padding: "8px" }}
      />

      {/* Input footer */}
      <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 shrink-0">
        <input
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
          placeholder={exec?.status === "running" ? "Send message to agent…" : "Session not running"}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={exec?.status !== "running" || sending}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || exec?.status !== "running" || sending}
          className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--bg)] disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Send
        </button>
      </div>
    </div>
  );
}
