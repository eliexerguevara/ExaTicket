import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "classic",
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "build",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "material-ui": [
            "@material-ui/core",
            "@material-ui/icons",
            "@material-ui/lab",
          ],
        },
      },
      // Force Rollup to use the CommonJS (non-ESM) distribution of date-fns
      // to avoid "Could not resolve ./_lib/Setter.js" errors in date-fns ESM
      external: [],
    },
  },
  envPrefix: "VITE_",
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: [
      "mic-recorder-to-mp3",
      "@material-ui/core",
      "@material-ui/icons",
      "@material-ui/lab",
      // Force Vite to pre-bundle date-fns as CJS, preventing Rollup from
      // trying to resolve the incomplete ESM package paths at build time
      "date-fns",
    ],
    exclude: [],
  },
  resolve: {
    alias: {
      "jss-plugin-globalThis": "jss-plugin-global",
      // Redirect date-fns ESM imports to CommonJS to avoid missing _lib files
      "date-fns/esm": "date-fns",
    },
  },
});
