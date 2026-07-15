import type { Issue, Stats, AgentExecution, AgentTrigger, AgentRuntime, Formula } from "../types";

class HttpClient {
  constructor(private readonly base: string) {}

  async request<T>(url: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(this.base + url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data as T;
  }
}

class IssuesApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: Record<string, string>): Promise<Issue[]> {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.http.request<Issue[]>(`/issues${qs}`);
  }

  ready(): Promise<Issue[]> {
    return this.http.request<Issue[]>("/issues/ready");
  }

  stats(): Promise<Stats> {
    return this.http.request<Stats>("/issues/stats");
  }

  get(id: string): Promise<Issue> {
    return this.http.request<Issue>(`/issues/${id}`);
  }

  create(data: Partial<Issue> & { title: string }): Promise<Issue> {
    return this.http.request<Issue>("/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  update(id: string, data: Partial<Issue>): Promise<Issue> {
    return this.http.request<Issue>(`/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  claim(id: string): Promise<Issue> {
    return this.http.request<Issue>(`/issues/${id}/claim`, { method: "POST" });
  }

  close(id: string, reason?: string): Promise<Issue> {
    return this.http.request<Issue>(`/issues/${id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  }

  reopen(id: string): Promise<Issue> {
    return this.http.request<Issue>(`/issues/${id}/reopen`, { method: "POST" });
  }

  comment(id: string, body: string): Promise<unknown> {
    return this.http.request<unknown>(`/issues/${id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  }

  comments(id: string): Promise<unknown[]> {
    return this.http.request<unknown[]>(`/issues/${id}/comments`);
  }
}

class DepsApi {
  constructor(private readonly http: HttpClient) {}

  list(id: string): Promise<unknown[]> {
    return this.http.request<unknown[]>(`/issues/${id}/deps`);
  }

  add(child: string, parent: string, type?: string): Promise<unknown> {
    return this.http.request<unknown>("/deps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ child, parent, type }),
    });
  }
}

class RuntimesApi {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<AgentRuntime[]> {
    return this.http.request<AgentRuntime[]>("/runtimes");
  }
}

class ExecutionsApi {
  constructor(private readonly http: HttpClient) {}

  list(issueId: string): Promise<AgentExecution[]> {
    return this.http.request<AgentExecution[]>(`/executions/issue/${issueId}`);
  }

  start(issueId: string, runtimeId: string, prompt: string): Promise<AgentExecution> {
    return this.http.request<AgentExecution>("/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, runtimeId, prompt }),
    });
  }

  cancel(id: string): Promise<{ ok: boolean }> {
    return this.http.request<{ ok: boolean }>(`/executions/${id}`, { method: "DELETE" });
  }
}

class TmuxApi {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<AgentExecution[]> {
    return this.http.request<AgentExecution[]>("/tmux/sessions");
  }

  kill(execId: string): Promise<{ ok: boolean }> {
    return this.http.request<{ ok: boolean }>(`/tmux/sessions/${execId}`, { method: "DELETE" });
  }
}

class FormulasApi {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<Formula[]> {
    return this.http.request<Formula[]>("/formulas");
  }

  get(name: string): Promise<Formula> {
    return this.http.request<Formula>(`/formulas/${encodeURIComponent(name)}`);
  }
}

class TriggersApi {
  constructor(private readonly http: HttpClient) {}

  list(issueId: string): Promise<AgentTrigger[]> {
    return this.http.request<AgentTrigger[]>(`/triggers/issue/${issueId}`);
  }

  create(data: Omit<AgentTrigger, "id" | "createdAt">): Promise<AgentTrigger> {
    return this.http.request<AgentTrigger>("/triggers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  update(id: string, patch: Partial<AgentTrigger>): Promise<AgentTrigger> {
    return this.http.request<AgentTrigger>(`/triggers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  delete(id: string): Promise<{ ok: boolean }> {
    return this.http.request<{ ok: boolean }>(`/triggers/${id}`, { method: "DELETE" });
  }
}

export class ApiClient {
  readonly issues: IssuesApi;
  readonly deps: DepsApi;
  readonly runtimes: RuntimesApi;
  readonly executions: ExecutionsApi;
  readonly triggers: TriggersApi;
  readonly tmux: TmuxApi;
  readonly formulas: FormulasApi;
  private readonly http: HttpClient;

  constructor(base: string) {
    this.http = new HttpClient(base);
    this.issues = new IssuesApi(this.http);
    this.deps = new DepsApi(this.http);
    this.runtimes = new RuntimesApi(this.http);
    this.executions = new ExecutionsApi(this.http);
    this.triggers = new TriggersApi(this.http);
    this.tmux = new TmuxApi(this.http);
    this.formulas = new FormulasApi(this.http);
  }

  graph(): Promise<unknown> {
    return this.http.request<unknown>("/graph");
  }

  initStatus(): Promise<{ initialized: boolean }> {
    return this.http.request<{ initialized: boolean }>("/init-status");
  }

  init(dir?: string): Promise<{ ok: boolean; output: string }> {
    return this.http.request<{ ok: boolean; output: string }>("/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir }),
    });
  }
}
