import { defineConfig } from "vite";

// Relative asset URLs, so the build works unchanged wherever the Pages
// artifact ends up mounted (currently /modo-incognito/).
export default defineConfig({
  base: "./",
});
