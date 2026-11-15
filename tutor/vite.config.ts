import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), "VITE_"));
  return {
    root: resolve(import.meta.dirname),
    base: "/tutor/",
    plugins: [react(), tailwindcss()],
    build: {
      outDir: "../dist/tutor",
      emptyOutDir: true,
      chunkSizeWarningLimit: 900,
    },
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
  };
});
