// Copies the tesseract.js worker, WASM core and English model into public/ so passport OCR
// runs entirely from our own origin (no third-party CDN, works behind strict networks).
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "tesseract");
const nm = path.join(root, "node_modules");

mkdirSync(path.join(out, "core"), { recursive: true });
mkdirSync(path.join(out, "lang"), { recursive: true });

cpSync(path.join(nm, "tesseract.js", "dist", "worker.min.js"), path.join(out, "worker.min.js"));
const coreDir = path.join(nm, "tesseract.js-core");
for (const f of readdirSync(coreDir).filter((f) => f.endsWith("lstm.wasm.js"))) {
  cpSync(path.join(coreDir, f), path.join(out, "core", f));
}
const lang = path.join(nm, "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz");
if (existsSync(lang)) cpSync(lang, path.join(out, "lang", "eng.traineddata.gz"));
console.log("OCR assets copied to public/tesseract");
