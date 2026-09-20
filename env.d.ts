/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 百度地图浏览器端密钥，由 .env.local 注入；缺失时地图回退为内置示意图 */
  readonly VITE_BAIDU_MAP_AK?: string;
  /** 当前使用的后端环境 */
  readonly VITE_API_MODE?: "local" | "server";
  /** 本地开发后端根地址 */
  readonly VITE_LOCAL_API_BASE_URL?: string;
  /** 已部署服务器后端根地址 */
  readonly VITE_SERVER_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
