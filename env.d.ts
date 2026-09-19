/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 百度地图浏览器端密钥，由 .env.local 注入；缺失时地图回退为内置示意图 */
  readonly VITE_BAIDU_MAP_AK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
