import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import devtoolsJson from 'vite-plugin-devtools-json';

export default defineConfig(() => {
  // Use repository name as base for GitHub Pages deployment
  // NOTE: we now use a custom domain of pybrickspilot.org, so no need for a basename
  // const base = process.env.GITHUB_PAGES === 'true' ? '/pybricks-pilot/' : '/';
  const base = "/";

  return {
    base,
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), devtoolsJson()],
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
