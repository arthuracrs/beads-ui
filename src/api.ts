import type { Issue, Stats, AgentExecution, AgentTrigger, AgentRuntime } from "./types";

const BASE = "/api";

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export const api = {
  issues: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return req<Issue[]>(`/issues${qs}`);
    },
    ready: () => req<Issue[]>("/issues/ready"),
    stats: () => req<Stats>("/issues/stats"),
    get: (id: string) => req<Issue>(`/issues/${id}`),
    create: (data: Partial<Issue> & { title: string }) =>
      req<Issue>("/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Issue>) =>
      req<Issue>(`/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    claim: (id: string) =>
      req<Issue>(`/issues/${id}/claim`, { method: "POST" }),
    close: (id: string, reason?: string) =>
      req<Issue>(`/issues/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    reopen: (id: string) =>
      req<Issue>(`/issues/${id}/reopen`, { method: "POST" }),
    comment: (id: string, body: string) =>
      req<unknown>(`/issues/${id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }),
  },
  deps: {
    list: (id: string) => req<unknown[]>(`/issues/${id}/deps`),
    add: (child: string, parent: string, type?: string) =>
      req<unknown>("/deps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ child, parent, type }),
      }),
  },
  runtimes: {
    list: () => req<AgentRuntime[]>("/runtimes"),
    create: (data: Omit<AgentRuntime, "id" | "builtin">) =>
      req<AgentRuntime>("/runtimes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (id: string, patch: Partial<Omit<AgentRuntime, "id" | "builtin">>) =>
      req<AgentRuntime>(`/runtimes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/runtimes/${id}`, { method: "DELETE" }),
  },
  executions: {
    list: (issueId: string) => req<AgentExecution[]>(`/executions/issue/${issueId}`),
    start: (issueId: string, command: string) =>
      req<AgentExecution>("/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, command }),
      }),
    cancel: (id: string) =>
      req<{ ok: boolean }>(`/executions/${id}`, { method: "DELETE" }),
  },
  triggers: {
    list: (issueId: string) => req<AgentTrigger[]>(`/triggers/issue/${issueId}`),
    create: (data: Omit<AgentTrigger, "id" | "createdAt">) =>
      req<AgentTrigger>("/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (id: string, patch: Partial<AgentTrigger>) =>
      req<AgentTrigger>(`/triggers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/triggers/${id}`, { method: "DELETE" }),
  },
  initStatus: () => req<{ initialized: boolean }>("/init-status"),
  init: (dir?: string) =>
    req<{ ok: boolean; output: string }>("/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir }),
    }),
};
