import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // 监听所有网卡，允许通过公网 IP / 域名远程访问（默认仅 127.0.0.1）
    host: true,
    port: 5173,
    // 若通过自定义域名访问，需把域名加入此白名单；用 IP 访问无需配置
    allowedHosts: ["101.37.237.23"],
  },
});
