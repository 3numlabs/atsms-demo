import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // ws is Node.js only - browser uses native WebSocket
      ws: path.resolve(__dirname, "./src/lib/ws-shim.ts"),
    },
  },
  build: {
    rollupOptions: {
      external: ["better-sqlite3"],
    },
  },
});
