"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeRegistry = exports.RuntimeRegistry = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function resolveAnagent() {
    // 1. Environment variable override
    if (process.env.ANAGENT_PATH) {
        return { bin: process.env.ANAGENT_PATH, args: ["runtimes", "--json"] };
    }
    // 2. Local development — adjacent repo
    const localDist = path_1.default.join(__dirname, "../../anagent/dist/cli.js");
    if (fs_1.default.existsSync(localDist)) {
        return { bin: "node", args: [localDist, "runtimes", "--json"] };
    }
    // 3. PATH
    const PATH = process.env.PATH || "";
    for (const dir of PATH.split(":")) {
        const candidate = path_1.default.join(dir, "anagent");
        if (fs_1.default.existsSync(candidate)) {
            return { bin: candidate, args: ["runtimes", "--json"] };
        }
    }
    // 4. npx fallback
    return { bin: "npx", args: ["--yes", "github:arthuracrs/anagent", "runtimes", "--json"] };
}
function fetchRuntimesFromAnagent() {
    const { bin, args } = resolveAnagent();
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)(bin, args, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("close", (code) => {
            if (code === 0 && stdout.trim()) {
                try {
                    const parsed = JSON.parse(stdout);
                    resolve(parsed.map((r) => ({
                        id: r.id,
                        name: r.name,
                        description: r.description,
                        defaultMode: r.defaultMode,
                    })));
                }
                catch (e) {
                    reject(new Error(`Failed to parse anagent runtimes output: ${e.message}`));
                }
            }
            else {
                reject(new Error(`anagent runtimes exited code ${code}: ${stderr.slice(0, 200)}`));
            }
        });
        proc.on("error", reject);
    });
}
class RuntimeRegistry {
    constructor() {
        this.cache = null;
        this.cacheTime = 0;
        this.CACHE_TTL = 30000;
    }
    async list() {
        if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
            return this.cache;
        }
        try {
            this.cache = await fetchRuntimesFromAnagent();
            this.cacheTime = Date.now();
        }
        catch {
            this.cache = [];
        }
        return this.cache;
    }
    async get(id) {
        const runtimes = await this.list();
        return runtimes.find((r) => r.id === id);
    }
}
exports.RuntimeRegistry = RuntimeRegistry;
exports.runtimeRegistry = new RuntimeRegistry();
