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
          if (!id.includes('node_modules')) return;

          /**
           * Match the package name, not the substring.
           *
           * `id.includes('react')` matched the whole path, so every
           * @radix-ui/react-*, lucide-react, react-hook-form, react-day-picker
           * and @tanstack/react-query package matched it — and because it was
           * tested first, all of them were swept into vendor-react, which
           * index.html modulepreloads on every page. The tell was vendor-radix
           * building to 0.2 kB gzipped while the app uses Radix everywhere:
           * the chunk was empty because its contents had already been claimed.
           *
           * So normalise the separators and match on the package directory
           * boundary, most specific first.
           */
          const path = id.replace(/\\/g, '/');
          const pkg = (name: string) => path.includes(`/node_modules/${name}/`);

          if (pkg('@tanstack/react-query')) return 'vendor-query';
          if (path.includes('/node_modules/@radix-ui/')) return 'vendor-radix';
          if (pkg('lucide-react')) return 'vendor-icons';
          if (pkg('framer-motion')) return 'vendor-motion';
          // React itself and only what it cannot run without. Anything merely
          // *named* react-something is a separate library and stays out.
          if (pkg('react') || pkg('react-dom') || pkg('scheduler') || pkg('react-is')) {
            return 'vendor-react';
          }
          // NOTE: do NOT add a catch-all `return 'vendor'` here — it forces
          // lazy-tab-only deps into one eagerly-loaded chunk, bloating first
          // load. Let Rollup keep unmatched deps in their importer's chunk so
          // lazy tabs stay lazy. recharts/jspdf/html2canvas are already split
          // out automatically because only lazy tabs import them.
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
        proxyTimeout: 0,
        timeout: 0,
      },
    },
    watch: {
      usePolling: true,
    },
  },
});
