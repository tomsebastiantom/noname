import { defineConfig } from "vite";

export default defineConfig({
  worker: {
    format: "es",
  },
  build: {
    lib: {
      entry: "src/index.ts",
      name: "Noname",
      formats: ["es", "iife"],
      fileName: (format) => (format === "iife" ? "noname.js" : "index.js"),
    },
    outDir: "dist",
    sourcemap: true,
    minify: "esbuild",
  },
});
