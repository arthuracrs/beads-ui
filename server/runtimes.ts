import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export interface AgentRuntime {
  id: string;
  name: string;
  description: string;
  defaultMode: "headless" | "tmux";
}

interface ResolveResult {
  bin: string;
  args: string[];
}

function resolveAnagent(): ResolveResult {
  // 1. Environment variable override
  if (process.env.ANAGENT_PATH) {
    return { bin: process.env.ANAGENT_PATH, args: ["runtimes", "--json"] };
  }

  // 2. Local development — adjacent repo
  const localDist = path.join(__dirname, "../../anagent/dist/cli.js");
  if (fs.existsSync(localDist)) {
    return { bin: "node", args: [localDist, "runtimes", "--json"] };
  }

  // 3. PATH
  const PATH = process.env.PATH || "";
  for (const dir of PATH.split(":")) {
    const candidate = path.join(dir, "anagent");
    if (fs.existsSync(candidate)) {
      return { bin: candidate, args: ["runtimes", "--json"] };
    }
  }

  // 4. npx fallback
  return { bin: "npx", args: ["--yes", "github:arthuracrs/anagent", "runtimes", "--json"] };
}

function fetchRuntimesFromAnagent(): Promise<AgentRuntime[]> {
  const { bin, args } = resolveAnagent();

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout) as { id: string; name: string; description: string; defaultMode: string }[];
          resolve(parsed.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            defaultMode: r.defaultMode as "headless" | "tmux",
          })));
        } catch (e) {
          reject(new Error(`Failed to parse anagent runtimes output: ${(e as Error).message}`));
        }
      } else {
        reject(new Error(`anagent runtimes exited code ${code}: ${stderr.slice(0, 200)}`));
      }
    });
    proc.on("error", reject);
  });
}

export class RuntimeRegistry {
  private cache: AgentRuntime[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 30000;

  async list(): Promise<AgentRuntime[]> {
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }
    try {
      this.cache = await fetchRuntimesFromAnagent();
      this.cacheTime = Date.now();
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  async get(id: string): Promise<AgentRuntime | undefined> {
    const runtimes = await this.list();
    return runtimes.find((r) => r.id === id);
  }
}

export const runtimeRegistry = new RuntimeRegistry();
