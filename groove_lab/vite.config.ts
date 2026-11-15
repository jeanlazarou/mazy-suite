import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  // Relative asset URLs: the build works from any folder of a static server.
  base: "./",
  // Injected as a literal so the app can show which build it is running
  // without importing (and bundling) package.json itself.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
});
