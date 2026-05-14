#!/usr/bin/env node
"use strict";
/**
 * Minimal MCP server exposing end_session tool.
 * Runs as a stdio subprocess inside the claude-tmux session.
 * Reads BEADS_EXEC_ID + BEADS_API_URL from env to know which session to close.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const readline = __importStar(require("readline"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
function send(msg) {
    process.stdout.write(JSON.stringify(msg) + "\n");
}
function respond(id, result) {
    send({ jsonrpc: "2.0", id: id ?? null, result });
}
function httpPost(url) {
    return new Promise((resolve, reject) => {
        const parsed = new url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https : http;
        const req = lib.request({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: "POST",
            headers: { "Content-Length": "0" } }, (res) => {
            let body = "";
            res.on("data", (chunk) => { body += chunk.toString(); });
            res.on("end", () => { try {
                resolve(JSON.parse(body));
            }
            catch {
                resolve({});
            } });
        });
        req.on("error", reject);
        req.end();
    });
}
const TOOLS = [
    {
        name: "end_session",
        description: "Signal that you have completed your task. This closes the tmux session and marks the execution as done in beads-ui. Call this when your work is finished.",
        inputSchema: {
            type: "object",
            properties: {
                summary: {
                    type: "string",
                    description: "Brief summary of what was accomplished (optional)",
                },
            },
        },
    },
];
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed)
        return;
    let req;
    try {
        req = JSON.parse(trimmed);
    }
    catch {
        return;
    }
    const { id, method } = req;
    if (method === "initialize") {
        respond(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "beads-session", version: "1.0.0" },
        });
        return;
    }
    if (method === "notifications/initialized") {
        return; // notification, no response
    }
    if (method === "tools/list") {
        respond(id, { tools: TOOLS });
        return;
    }
    if (method === "tools/call") {
        const params = req.params;
        if (params.name !== "end_session") {
            send({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: "Unknown tool" } });
            return;
        }
        const execId = process.env.BEADS_EXEC_ID;
        const apiUrl = process.env.BEADS_API_URL ?? "http://localhost:3001/api";
        const summary = params.arguments?.summary ?? "";
        if (!execId) {
            respond(id, {
                content: [{ type: "text", text: "Error: BEADS_EXEC_ID env var not set — cannot identify session." }],
                isError: true,
            });
            return;
        }
        try {
            await httpPost(`${apiUrl}/tmux/sessions/${execId}/complete`);
            respond(id, {
                content: [{ type: "text", text: `Session ended.${summary ? " " + summary : ""}` }],
            });
        }
        catch (err) {
            respond(id, {
                content: [{ type: "text", text: `Failed to end session: ${err.message}` }],
                isError: true,
            });
        }
        return;
    }
    // Unknown method
    send({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } });
});
