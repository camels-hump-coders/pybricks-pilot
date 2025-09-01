import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(() => {
  const base = process.env.BASE_PATH ?? "/";

  return {
    base,
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    worker: {
      format: "es" as const,
    },
    optimizeDeps: {
      exclude: ["pyodide"],
    },
    build: {
      outDir: "build/client",
      assetsDir: "assets",
      emptyOutDir: true,
    },
  };
});
