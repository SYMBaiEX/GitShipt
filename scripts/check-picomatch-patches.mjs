import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";

const entries = globSync([
  "node_modules/**/picomatch/package.json",
  "apps/*/node_modules/**/picomatch/package.json",
  "packages/*/node_modules/**/picomatch/package.json",
]).filter((file) => basename(dirname(dirname(file))) === "node_modules");

const versions = new Set();
for (const file of entries) {
  const { version } = JSON.parse(readFileSync(file, "utf8"));
  versions.add(version);
  const match = createRequire(import.meta.url)(resolve(dirname(file)));

  assert.equal(
    match("src/**/*.{ts,tsx}")("src/components/menu.tsx"),
    true,
    file,
  );
  assert.equal(match("src/@(menu|dialog).tsx")("src/menu.tsx"), true, file);
  assert.equal(match("src/+(menu).tsx")("src/menumenu.tsx"), false, file);
  assert.equal(match("src/*(menu).tsx")("src/.tsx"), false, file);
  const cannotOptOut = match("src/+(menu).tsx", { maxExtglobRecursion: false });
  assert.equal(cannotOptOut("src/menumenu.tsx"), false, file);
  assert.equal(cannotOptOut("src/+(menu).tsx"), true, file);
}

assert.deepEqual([...versions].sort(), ["2.3.2", "4.0.7"]);
console.log(
  `Verified picomatch hardening across ${entries.length} installed copies.`,
);
