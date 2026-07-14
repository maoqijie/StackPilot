import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import packageJson from "./package.json" with { type: "json" };
import { DEFAULT_API_PROXY_TARGET, DEFAULT_WEB_HOST, DEFAULT_WEB_PORT } from "@stackpilot/config";

const webPort = Number(process.env.STACKPILOT_WEB_PORT ?? DEFAULT_WEB_PORT);

const apiProxy = {
  target: process.env.STACKPILOT_API_PROXY_TARGET ?? DEFAULT_API_PROXY_TARGET,
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_REPOSITORY_URL__: JSON.stringify("https://github.com/maoqijie/StackPilot"),
  },
  server: {
    host: DEFAULT_WEB_HOST,
    port: webPort,
    proxy: {
      "/api": apiProxy,
      "/healthz": apiProxy,
      "/readyz": apiProxy,
    },
  },
  preview: {
    host: DEFAULT_WEB_HOST,
    proxy: {
      "/api": apiProxy,
      "/healthz": apiProxy,
      "/readyz": apiProxy,
    },
  },
});
