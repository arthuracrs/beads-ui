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

const BUILTINS: AgentRuntime[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic Claude Code CLI",
    commandTemplate: `claude --dangerously-skip-permissions -p "{prompt}"`,
    builtin: true,
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Cursor AI agent CLI (--force applies changes directly)",
    commandTemplate: `agent -p --force "{prompt}"`,
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

function saveCustom(runtimes: AgentRuntime[]) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(runtimes, null, 2));
}

export function listRuntimes(): AgentRuntime[] {
  return [...BUILTINS, ...loadCustom()];
}

export function getRuntime(id: string): AgentRuntime | undefined {
  return listRuntimes().find((r) => r.id === id);
}

export function createRuntime(data: Omit<AgentRuntime, "id" | "builtin">): AgentRuntime {
  const custom = loadCustom();
  const runtime: AgentRuntime = {
    ...data,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    builtin: false,
  };
  custom.push(runtime);
  saveCustom(custom);
  return runtime;
}

export function updateRuntime(id: string, patch: Partial<Omit<AgentRuntime, "id" | "builtin">>): AgentRuntime | undefined {
  const custom = loadCustom();
  const idx = custom.findIndex((r) => r.id === id);
  if (idx === -1) return undefined; // can't update builtins
  Object.assign(custom[idx], patch);
  saveCustom(custom);
  return custom[idx];
}

export function deleteRuntime(id: string): boolean {
  const custom = loadCustom();
  const idx = custom.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  custom.splice(idx, 1);
  saveCustom(custom);
  return true;
}
