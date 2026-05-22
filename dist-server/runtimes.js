"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeRegistry = exports.RuntimeRegistry = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
// NOTE: {prompt} is shell-quoted server-side, so templates must NOT wrap it
// in their own quotes.
const BUILTINS = [
    {
        id: "claude-code",
        name: "Claude Code",
        description: "Anthropic Claude Code CLI",
        commandTemplate: `claude --dangerously-skip-permissions -p {prompt} --output-format stream-json --verbose --include-partial-messages`,
        builtin: true,
    },
    {
        id: "claude-tmux",
        name: "Claude (tmux)",
        description: "Interactive Claude TUI in a tmux session — watch and nudge it from the browser",
        commandTemplate: `claude --dangerously-skip-permissions {prompt}`,
        kind: "tmux",
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
        id: "anagent",
        name: "anagent",
        description: "anagent CLI — runs prompts through configurable agent runtimes",
        commandTemplate: `anagent run {prompt}`,
        builtin: true,
    },
];
class RuntimeRegistry {
    constructor() {
        this.builtins = [...BUILTINS];
        this.configFile = path_1.default.join(os_1.default.homedir(), ".config", "beads-ui", "runtimes.json");
    }
    list() {
        return [...this.builtins, ...this.loadCustom()];
    }
    get(id) {
        return this.list().find((r) => r.id === id);
    }
    loadCustom() {
        try {
            if (!fs_1.default.existsSync(this.configFile))
                return [];
            return JSON.parse(fs_1.default.readFileSync(this.configFile, "utf-8"));
        }
        catch {
            return [];
        }
    }
}
exports.RuntimeRegistry = RuntimeRegistry;
exports.runtimeRegistry = new RuntimeRegistry();
