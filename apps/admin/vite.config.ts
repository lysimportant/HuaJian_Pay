import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Dev proxy targets apps/server default PORT=8080 (see monorepo .env.example).
const SERVER = "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/admin/api": SERVER,
      "/api": SERVER,
      "/health": SERVER,
      "/submit.php": SERVER,
      "/mapi.php": SERVER,
      "/api.php": SERVER,
      "/pay": SERVER,
      "/channels": SERVER,
      "/mock": SERVER,
    },
  },
});
