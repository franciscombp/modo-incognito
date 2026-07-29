import { defineConfig } from "vite";

// Relative asset URLs. GitHub Pages can be configured to publish either from
// the Actions artifact (served at /modo-incognito/) or straight from the repo
// root of `main`; with a relative base the same build works under both, so a
// settings change can never turn the site into a 404 or a rendered README.
export default defineConfig({
  base: "./",
});
