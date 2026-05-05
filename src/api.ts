import type { Issue, Stats } from "./types";

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
  initStatus: () => req<{ initialized: boolean }>("/init-status"),
  init: (dir?: string) =>
    req<{ ok: boolean; output: string }>("/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir }),
    }),
};
