import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ExecStatus } from "../types";
import { AgentViewHeader } from "./AgentViewHeader";

interface Props {
  executionId: string;
  onClose: () => void;
}

interface NSEvent {
  type: string;
  delta?: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
  isError?: boolean;
  status?: string;
  exitCode?: number;
  output?: string;
  error?: string;
  tmuxSession?: string;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function formatToolInput(input: Record<string, unknown>): string {
  if (typeof input.command === "string") {
    return `\`${(input.command as string).slice(0, 300)}\``;
  }
  const s = JSON.stringify(input);
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

export function ExecutionView({ executionId, onClose }: Props) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<ExecStatus>("running");
  const [cancelling, setCancelling] = useState(false);
  const [tmuxSession, setTmuxSession] = useState("");
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiBase = import.meta.env.DEV ? "http://localhost:3001" : "";
    const es = new EventSource(`${apiBase}/api/executions/${executionId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as NSEvent;

        if (msg.type === "start" && msg.tmuxSession) {
          setTmuxSession(msg.tmuxSession);
          setOutput((prev) => prev + `\x1b[2mInteractive mode — attached to tmux session\x1b[0m\n`);
          scrollToBottom();
        }

        if (msg.type === "text" && msg.delta) {
          setOutput((prev) => prev + msg.delta);
          scrollToBottom();
        }

        if (msg.type === "tool_use" && msg.name) {
          const line = `\n\x1b[36m▶ ${msg.name}\x1b[0m ${formatToolInput(msg.input ?? {})}\n`;
          setOutput((prev) => prev + line);
          scrollToBottom();
        }

        if (msg.type === "tool_result" && msg.text) {
          const text = msg.text.length > 500
            ? msg.text.slice(0, 500) + "\n\x1b[2m…(truncated)\x1b[0m"
            : msg.text;
          const line = `\x1b[2m${text}\x1b[0m\n`;
          setOutput((prev) => prev + line);
          scrollToBottom();
        }

        if (msg.type === "done") {
          if (msg.output) setOutput((prev) => prev + msg.output!);
          setStatus("completed");
          es.close();
        }

        if (msg.type === "failed") {
          if (msg.error) setOutput((prev) => prev + `\nError: ${msg.error}\n`);
          setStatus("failed");
          es.close();
        }
      } catch {
        // Ignore malformed SSE events
      }
    };

    es.onerror = () => {
      setStatus((s) => (s === "running" ? "failed" : s));
      es.close();
    };

    return () => es.close();
  }, [executionId]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    });
  }

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

  function handleCopyAttach() {
    if (!tmuxSession) return;
    navigator.clipboard.writeText(`tmux attach -t ${tmuxSession}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          <div className="flex items-center gap-2">
            {tmuxSession && (
              <button
                onClick={handleCopyAttach}
                title={`Attach to tmux session: tmux attach -t ${tmuxSession}`}
                className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                {copied ? "Copied!" : "⎋ Attach"}
              </button>
            )}
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-md border border-[var(--red)]/40 bg-[var(--red)]/10 px-3 py-1 text-xs text-[var(--red)] hover:bg-[var(--red)]/20 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
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
        {status === "running" && !output && <span className="animate-pulse">▌</span>}
      </pre>

      {/* Footer */}
      <div className="flex items-center gap-4 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-2 text-xs text-[var(--text-muted)]">
        <span>{output.split("\n").length} lines · {(new Blob([output]).size / 1024).toFixed(1)} KB</span>
        {tmuxSession && (
          <span className="font-mono text-[var(--accent)]">tmux: {tmuxSession}</span>
        )}
        <span className="ml-auto">Press Esc to close</span>
      </div>
    </div>
  );
}
