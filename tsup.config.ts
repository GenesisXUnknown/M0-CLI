import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/m0.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
