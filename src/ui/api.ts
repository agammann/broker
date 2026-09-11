export let csrf = "";
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-Broker-Client": "owner",
            "X-CSRF-Token": csrf,
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(String(data.code ?? "request_failed").replaceAll("_", " "));
  if (data.csrf) csrf = data.csrf;
  return data;
}
export type Account = {
  id: string;
  label: string;
  state: string;
  adapter: string;
};
export type Agent = {
  id: string;
  label: string;
  expires: number;
  revoked: boolean;
};
export type Grant = {
  id: string;
  revoked: number;
  config: {
    agent_id: string;
    account_id: string;
    operation: string;
    starts: number;
    expires: number;
    max_session_seconds: number;
    rate: number;
    concurrency: number;
    approval_required: boolean;
    from: string;
    to: string;
  };
};
export type Snapshot = {
  vault: { unlocked: boolean; locks_at: number };
  settings: { lock_seconds: number; retention_days: number };
  accounts: Account[];
  agents: Agent[];
  grants: Grant[];
  approvals: {
    request_id: string;
    agent_id: string;
    account_id: string;
    reason: string;
    deadline: number;
    policy_version: number;
  }[];
  sessions: {
    session_id: string;
    agent_id: string;
    account_id: string;
    expires: number;
    status: string;
  }[];
  activity: {
    id: number;
    time: number;
    event: string;
    actor: string;
    target: string | null;
    code: string | null;
    duration_ms: number | null;
  }[];
  metrics: {
    event: string;
    code: string | null;
    count: number;
    mean_ms: number | null;
  }[];
  adapters: { id: string; label: string }[];
};
export const when = (n: number) => new Date(n).toLocaleString();
