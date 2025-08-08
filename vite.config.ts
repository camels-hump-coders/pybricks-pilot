import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  // Use repository name as base for GitHub Pages deployment
  const base = process.env.GITHUB_PAGES === 'true' 
    ? '/pybricks-pilot/' 
    : '/';

  return {
    base,
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    worker: {
      format: 'es'
    },
    optimizeDeps: {
      exclude: ['pyodide']
    },
    build: {
      outDir: 'build/client',
      assetsDir: 'assets',
      emptyOutDir: true
    }
  };
});
