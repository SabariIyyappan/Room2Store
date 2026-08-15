import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // With no VITE_API_BASE_URL set, the client calls a relative /api path and
    // this forwards it to the perception service, so local dev needs no CORS.
    proxy: {
      "/api": {
        target: process.env.PERCEPTION_SERVICE_URL ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
