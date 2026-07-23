import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  publicDir: "frontend/public",
  // Version-skew guard: worker and client are built from the same commit in
  // one vite build, so both sides carry the same id. CI provides GITHUB_SHA;
  // local dev builds get "dev" on both sides (never a mismatch).
  define: {
    __BUILD_ID__: JSON.stringify((process.env.GITHUB_SHA ?? "dev").slice(0, 12)),
  },
  plugins: [
    svgr(),
    react(),
    cloudflare(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["lucide-react", "react-markdown"],
        },
      },
    },
  },
});
