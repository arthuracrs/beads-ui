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

// NOTE: {prompt} is shell-quoted server-side, so templates must NOT wrap it
// in their own quotes.
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
];

export class RuntimeRegistry {
  private readonly builtins: AgentRuntime[];
  private readonly configFile: string;

  constructor() {
    this.builtins = [...BUILTINS];
    this.configFile = path.join(os.homedir(), ".config", "beads-ui", "runtimes.json");
  }

  list(): AgentRuntime[] {
    return [...this.builtins, ...this.loadCustom()];
  }

  get(id: string): AgentRuntime | undefined {
    return this.list().find((r) => r.id === id);
  }

  private loadCustom(): AgentRuntime[] {
    try {
      if (!fs.existsSync(this.configFile)) return [];
      return JSON.parse(fs.readFileSync(this.configFile, "utf-8")) as AgentRuntime[];
    } catch {
      return [];
    }
  }
}

export const runtimeRegistry = new RuntimeRegistry();
