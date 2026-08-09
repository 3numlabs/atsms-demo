import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/** Fail the build, not the browser. Both values are deployment choices with no
 *  sensible default — see .env.example — and a bundle missing them would only
 *  break once someone loaded the page. */
function requireEnv(mode: string): void {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const missing = ["VITE_ATSMS_API_URL", "VITE_ATSMS_EMAIL_DOMAIN"].filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(" and ")} not set. Copy .env.example to .env and fill it in, or pass them to ` +
        `the build. There is deliberately no default relay: run atsms-worker yourself, or use one you trust.`,
    );
  }
}

export default defineConfig(({ mode, command }) => {
  if (command === "build") requireEnv(mode);
  return {
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
  };
});
