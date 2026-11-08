import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api is proxied to the TypeScript backend, so the browser never needs CORS.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
});
