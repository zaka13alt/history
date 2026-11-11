// Build step for study.html
// -------------------------------------------------------------------------
// The readable source lives in ../study.html (committed to GitHub). This step
// obfuscates the large inline application <script> block so the copy deployed
// to the webroot can't be trivially copy-pasted/scraped off the live site.
// The tiny gtag stub and all external <script src="..."> files are left as-is.
//
//   node build-study.mjs            -> writes ../dist/study.html
//   node build-study.mjs --deploy   -> also copies it to the webroot via sudo
//
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import JavaScriptObfuscator from "javascript-obfuscator";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const srcPath = join(repo, "study.html");
const outDir = join(repo, "dist");
const outPath = join(outDir, "study.html");
const WEBROOT = "/usr/share/caddy/study.html";

// Only inline blocks larger than this are obfuscated (skips the gtag stub).
const MIN_LEN = 400;

// Moderate settings: enough to defeat casual scraping/reading, but no
// self-defending / debug-protection / domain-lock — this is the live proxy UI
// and it must keep working everywhere and load fast.
const OBF_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 10,
  transformObjectKeys: true,
  identifierNamesGenerator: "hexadecimal",
  // renameProperties stays OFF so window.* / DOM property access is preserved.
};

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

let html = readFileSync(srcPath, "utf8");
let obfuscated = 0;

html = html.replace(SCRIPT_RE, (full, attrs, body) => {
  if (/\bsrc\s*=/i.test(attrs)) return full;      // external file, leave alone
  if (body.trim().length < MIN_LEN) return full;  // tiny stub (gtag), leave alone
  const code = JavaScriptObfuscator.obfuscate(body, OBF_OPTIONS).getObfuscatedCode();
  if (/<\/script/i.test(code)) {
    throw new Error("obfuscated output contains </script — would break the tag");
  }
  obfuscated++;
  return `<script${attrs}>${code}</script>`;
});

if (obfuscated === 0) {
  console.error("ERROR: no inline script block matched — refusing to write a no-op build.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, html);
console.log(`obfuscated ${obfuscated} inline block(s): ${srcPath} -> ${outPath}`);

if (process.argv.includes("--deploy")) {
  execFileSync("sudo", ["cp", outPath, WEBROOT], { stdio: "inherit" });
  console.log(`deployed -> ${WEBROOT}`);
}
