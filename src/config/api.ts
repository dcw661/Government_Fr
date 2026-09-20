export type ApiMode = "local" | "server";

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`API 地址仅支持 HTTP 或 HTTPS：${raw}`);
  }
  return `${url.toString().replace(/\/+$/, "")}/`;
}

const requestedMode = import.meta.env.VITE_API_MODE?.trim().toLowerCase();
export const apiMode: ApiMode = requestedMode === "server" ? "server" : "local";

export const localApiBaseUrl = normalizeBaseUrl(
  import.meta.env.VITE_LOCAL_API_BASE_URL,
  "http://localhost:8080/",
);

export const serverApiBaseUrl = normalizeBaseUrl(
  import.meta.env.VITE_SERVER_API_BASE_URL,
  "https://api.example.gov.cn/",
);

export const apiBaseUrl =
  apiMode === "server" ? serverApiBaseUrl : localApiBaseUrl;

export const apiEnvironmentLabel = apiMode === "server" ? "服务器环境" : "本地环境";
