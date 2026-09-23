import { apiBaseUrl } from "../config/api";
import { statuses, type Issue, type Status } from "../data/issues";

type UpdateIssueInput = {
  assignee: string;
  progress: Status;
  version: number;
};

type ProblemDetail = {
  detail?: string;
  title?: string;
  message?: string;
};

function endpoint(path: string): string {
  return new URL(path.replace(/^\/+/, ""), apiBaseUrl).toString();
}

function absoluteMediaUrl(value: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  return new URL(value, apiBaseUrl).toString();
}

function parseIssue(value: unknown): Issue {
  if (!value || typeof value !== "object") {
    throw new Error("后端返回了无效的问题单数据");
  }
  const item = value as Record<string, unknown>;
  const progress = item.progress;
  if (
    typeof item.id !== "string" ||
    typeof item.title !== "string" ||
    typeof item.submitter !== "string" ||
    typeof item.submittedAt !== "string" ||
    typeof item.longitude !== "number" ||
    typeof item.latitude !== "number" ||
    !Array.isArray(item.images) ||
    !item.images.every((image) => typeof image === "string") ||
    (item.pendingImages !== undefined && (typeof item.pendingImages !== "number" || !Number.isInteger(item.pendingImages) || item.pendingImages < 0)) ||
    (item.failedImages !== undefined && (typeof item.failedImages !== "number" || !Number.isInteger(item.failedImages) || item.failedImages < 0)) ||
    typeof item.type !== "string" ||
    typeof item.description !== "string" ||
    typeof item.assignee !== "string" ||
    typeof item.address !== "string" ||
    typeof item.version !== "number" ||
    typeof progress !== "string" ||
    !statuses.includes(progress as Status)
  ) {
    throw new Error("后端问题单字段与前端契约不一致");
  }
  return {
    id: item.id,
    title: item.title,
    submitter: item.submitter,
    submittedAt: item.submittedAt,
    longitude: item.longitude,
    latitude: item.latitude,
    images: item.images.map(absoluteMediaUrl),
    pendingImages: typeof item.pendingImages === "number" ? item.pendingImages : 0,
    failedImages: typeof item.failedImages === "number" ? item.failedImages : 0,
    type: item.type,
    description: item.description,
    assignee: item.assignee,
    progress: progress as Status,
    address: item.address,
    version: item.version,
  };
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(`无法连接后端：${apiBaseUrl}`);
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as ProblemDetail;
    throw new Error(
      problem.detail || problem.message || problem.title || `请求失败（HTTP ${response.status}）`,
    );
  }
  return response.json();
}

export async function listIssues(): Promise<Issue[]> {
  const data = await request("api/v1/issues");
  if (!Array.isArray(data)) throw new Error("后端问题列表格式不正确");
  return data.map(parseIssue);
}

export async function getIssue(id: string): Promise<Issue> {
  return parseIssue(await request(`api/v1/issues/${encodeURIComponent(id)}`));
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<Issue> {
  return parseIssue(
    await request(`api/v1/issues/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

