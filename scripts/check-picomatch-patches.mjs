import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";

const patches = {
  "2.3.2": {
    patch: "ec92784411ad3dc22f28074321c91df9c943c54aa649777098c7e7164e3ace70",
    parser: "5d856cdc62c233c09286c69a9f53bfc7089fe444d719451f40e5505b9b15c19e",
  },
  "4.0.7": {
    patch: "033b2502174dd4b4e0c0292ab137c3b8c929b13402bf51edf38a4f8ba02d4f5d",
    parser: "06ad76b059e9127b0a6ff1875411b8be6cbbc739bd8958700ca9fcb73d015ad6",
  },
};
export const patchedPicomatchVersions = Object.keys(patches);
const sha256 = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

export function verifyPicomatchPatches() {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  for (const [version, expected] of Object.entries(patches)) {
    const path = `patches/picomatch@${version}.patch`;
    assert.equal(
      manifest.patchedDependencies?.[`picomatch@${version}`],
      path,
      version,
    );
    assert.equal(sha256(path), expected.patch, path);
  }
  const entries = globSync([
    "node_modules/**/picomatch/package.json",
    "apps/*/node_modules/**/picomatch/package.json",
    "packages/*/node_modules/**/picomatch/package.json",
  ]).filter((file) => basename(dirname(dirname(file))) === "node_modules");

  const versions = new Set();
  for (const file of entries) {
    const { version } = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(
      Object.hasOwn(patches, version),
      `Unexpected picomatch version at ${file}`,
    );
    assert.equal(
      sha256(resolve(dirname(file), "lib/parse.js")),
      patches[version].parser,
      file,
    );
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
    const cannotOptOut = match("src/+(menu).tsx", {
      maxExtglobRecursion: false,
    });
    assert.equal(cannotOptOut("src/menumenu.tsx"), false, file);
    assert.equal(cannotOptOut("src/+(menu).tsx"), true, file);
  }

  assert.deepEqual([...versions].sort(), [...patchedPicomatchVersions].sort());
  return entries.length;
}

if (import.meta.main) {
  console.log(
    `Verified picomatch hardening across ${verifyPicomatchPatches()} installed copies.`,
  );
}
