// Builds the Hardware Wallet practice page into practice/dist/ (index.html, practice.js, practice.css).
// Run from anywhere: node games/rarefriend-outlaw/practice/build.mjs  then open practice/dist/index.html in a browser.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../../.."), out = resolve(here, "dist");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
// The SDK is this checkout: resolve its public exports the way the game's own build does.
const sdk = { name: "friendsdk", setup(b) {
  b.onResolve({ filter: /^@rarefriends\/friendsdk(\/.*)?$/ }, args => {
    const entry = pkg.exports[args.path.replace("@rarefriends/friendsdk", ".") || "."];
    if (!entry) return { errors: [{ text: `Unknown SDK export: ${args.path}` }] };
    return { path: resolve(root, typeof entry === "string" ? entry : entry.import) };
  });
} };
await mkdir(out, { recursive: true });
await build({
  entryPoints: { practice: resolve(here, "practice.tsx"), sounds: resolve(here, "sounds.tsx") }, outdir: out, bundle: true, format: "iife", platform: "browser", target: "es2022",
  jsx: "automatic", minify: true, define: { "process.env.NODE_ENV": '"production"' }, plugins: [sdk], logLevel: "warning",
});
await writeFile(resolve(out, "index.html"), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wallet Practice</title>
<link rel="stylesheet" href="practice.css"></head>
<body><div id="root"></div><script src="practice.js"></script></body>
</html>
`);
await writeFile(resolve(out, "sounds.html"), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Outlaw sound preview</title>
<link rel="stylesheet" href="sounds.css"></head>
<body><div id="root"></div><script src="sounds.js"></script></body>
</html>
`);
await writeFile(resolve(out, "sounds.css"), await readFile(resolve(here, "sounds.css"), "utf8"));
console.log(`Built ${resolve(out, "index.html")} and ${resolve(out, "sounds.html")}`);
