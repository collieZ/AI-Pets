import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  publicDir: resolve(__dirname, "../web-poc/public"),
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true
  }
});
