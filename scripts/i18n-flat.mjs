// Prints the English interface texts as flat "section.key": "text" JSON (the source for translation packs).
// Usage: node --experimental-strip-types scripts/i18n-flat.mjs > en.flat.json
const { default: en } = await import("../src/i18n/en.ts");
const out = {};
(function walk(v, path) {
  if (typeof v === "string") out[path] = v;
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
})(en, "");
process.stdout.write(JSON.stringify(out, null, 1));
