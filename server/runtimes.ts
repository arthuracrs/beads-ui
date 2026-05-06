import fs from "fs";
import path from "path";
import os from "os";

export interface AgentRuntime {
  id: string;
  name: string;
  description: string;
  commandTemplate: string; // {prompt} is replaced with the user's prompt text
  builtin: boolean;
}

// NOTE: {prompt} is shell-quoted by the client (RunAgentModal.buildCommand) for
// every non-`custom` runtime, so templates must NOT wrap it in their own quotes.
const BUILTINS: AgentRuntime[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic Claude Code CLI",
    commandTemplate: `claude --dangerously-skip-permissions -p {prompt} --output-format stream-json --verbose --include-partial-messages`,
    builtin: true,
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Cursor AI agent CLI (--force applies changes directly)",
    commandTemplate: `agent -p --force {prompt}`,
    builtin: true,
  },
  {
    id: "custom",
    name: "Custom",
    description: "Write the full command yourself — {prompt} is passed through as-is",
    commandTemplate: `{prompt}`,
    builtin: true,
  },
];

const CONFIG_DIR = path.join(os.homedir(), ".config", "beads-ui");
const CONFIG_FILE = path.join(CONFIG_DIR, "runtimes.json");

function loadCustom(): AgentRuntime[] {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return [];
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as AgentRuntime[];
  } catch {
    return [];
  }
}


export function listRuntimes(): AgentRuntime[] {
  return [...BUILTINS, ...loadCustom()];
}

export function getRuntime(id: string): AgentRuntime | undefined {
  return listRuntimes().find((r) => r.id === id);
}

