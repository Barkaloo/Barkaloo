import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, import.meta.dirname, "VITE_TUTOR_"));
  return {
    root: resolve(import.meta.dirname),
    base: "/tutor/",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "tutor-python-runtime",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (/^\/(?:tutor\/)?python-runner\/runtime\/0\.27\.7\//.test(request.url ?? "")) {
              response.setHeader("Access-Control-Allow-Origin", "*");
            }
            next();
          });
        },
      },
    ],
    build: {
      outDir: "../dist/tutor",
      emptyOutDir: true,
      chunkSizeWarningLimit: 900,
    },
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
  };
});
