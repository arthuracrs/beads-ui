"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRuntimes = listRuntimes;
exports.getRuntime = getRuntime;
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
        id: "cursor",
        name: "Cursor",
        description: "Cursor AI agent CLI (--force applies changes directly)",
        commandTemplate: `agent -p --force {prompt}`,
        builtin: true,
    },
];
const CONFIG_DIR = path_1.default.join(os_1.default.homedir(), ".config", "beads-ui");
const CONFIG_FILE = path_1.default.join(CONFIG_DIR, "runtimes.json");
function loadCustom() {
    try {
        if (!fs_1.default.existsSync(CONFIG_FILE))
            return [];
        return JSON.parse(fs_1.default.readFileSync(CONFIG_FILE, "utf-8"));
    }
    catch {
        return [];
    }
}
function listRuntimes() {
    return [...BUILTINS, ...loadCustom()];
}
function getRuntime(id) {
    return listRuntimes().find((r) => r.id === id);
}
