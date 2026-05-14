#!/usr/bin/env node
/**
 * Minimal MCP server exposing end_session tool.
 * Runs as a stdio subprocess inside the claude-tmux session.
 * Reads BEADS_EXEC_ID + BEADS_API_URL from env to know which session to close.
 */

import * as readline from "readline";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function respond(id: string | number | undefined, result: unknown): void {
  send({ jsonrpc: "2.0", id: id ?? null, result });
}

function httpPost(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: "POST",
        headers: { "Content-Length": "0" } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
      },
    );
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
  if (!trimmed) return;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
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
    const params = req.params as { name: string; arguments?: { summary?: string } };
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
    } catch (err) {
      respond(id, {
        content: [{ type: "text", text: `Failed to end session: ${(err as Error).message}` }],
        isError: true,
      });
    }
    return;
  }

  // Unknown method
  send({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } });
});
