import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin()
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "capacitor-cli.d.ts": path.resolve(import.meta.dirname, "client", "src", "empty.ts"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  envDir: path.resolve(import.meta.dirname), // Load .env from project root
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('lucide-react')) return 'vendor-icons';
            // NOTE: do NOT add a catch-all `return 'vendor'` here — it forces
            // lazy-tab-only deps into one eagerly-loaded chunk, bloating first
            // load. Let Rollup keep unmatched deps in their importer's chunk so
            // lazy tabs stay lazy. recharts/jspdf/html2canvas are already split
            // out automatically because only lazy tabs import them.
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ['recharts'],
    exclude: ['@capgo/capacitor-updater']
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5083",
        changeOrigin: true,
        secure: false,
      },
    },
    watch: {
      usePolling: true,
    },
  },
});
