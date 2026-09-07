import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import { createRequire } from "node:module";

const __here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__here, "renderer"),
  resolve: {
    alias: {
      "@": resolve(__here, "renderer/src"),
      "@shared": resolve(__here, "shared"),
    },
  },
  plugins: [react()],
  // Worktrees may share or symlink packages outside the repository. Allow
  // KaTeX font assets from its resolved package as well as workspace sources.
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(__here),
        dirname(
          createRequire(resolve(__here, "renderer/package.json")).resolve(
            "katex/package.json",
          ),
        ),
      ],
    },
  },
});
