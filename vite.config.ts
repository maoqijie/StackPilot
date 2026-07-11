import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import packageJson from "./package.json" with { type: "json" };

const apiProxy = {
  target: "http://127.0.0.1:8787",
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_REPOSITORY_URL__: JSON.stringify("https://github.com/maoqijie/StackPilot"),
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": apiProxy,
    },
  },
  preview: {
    host: "127.0.0.1",
    proxy: {
      "/api": apiProxy,
    },
  },
});
