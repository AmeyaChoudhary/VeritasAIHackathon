import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" lets the built app run from any folder, or straight from a file server.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      // auth.html is where Microsoft and Fitbit sign-in windows come back to.
      input: { main: "index.html", auth: "auth.html" },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
