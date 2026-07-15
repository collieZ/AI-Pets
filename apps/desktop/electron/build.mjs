import { build } from "esbuild";

await build({
  entryPoints: ["electron/src/main.ts", "electron/src/preload.ts"],
  outdir: "electron/generated",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["electron"]
});
