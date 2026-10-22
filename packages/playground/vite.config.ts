import { defineConfig } from "vite";

// Relative base: the built site is plain static files and works from any path.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  server: { fs: { allow: ["../.."] } },
});
