#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  patchedPicomatchVersions,
  verifyPicomatchPatches,
} from "./check-picomatch-patches.mjs";

const PICOMATCH_ADVISORY = "GHSA-fc5q-39xc-vjpf";
const EXCEPTION_EXPIRES = "2026-12-17";
const AUDIT_LEVEL = "high";
const TODAY = new Date();

function verifyPicomatchException() {
  assert.ok(
    TODAY <= new Date(`${EXCEPTION_EXPIRES}T23:59:59Z`),
    "exception expired",
  );
  const lock = Bun.JSONC.parse(readFileSync("bun.lock", "utf8"));
  const versions = new Set();
  for (const [path, [descriptor]] of Object.entries(lock.packages)) {
    if (
      path.split("/").at(-1) !== "picomatch" &&
      !descriptor.startsWith("picomatch@")
    )
      continue;
    assert.ok(
      descriptor.startsWith("picomatch@"),
      `Unexpected package at ${path}`,
    );
    versions.add(descriptor.slice("picomatch@".length));
  }
  assert.deepEqual(
    [...versions].sort(),
    [...patchedPicomatchVersions].sort(),
    "unexpected locked versions",
  );
  for (const version of patchedPicomatchVersions) {
    assert.equal(
      lock.patchedDependencies?.[`picomatch@${version}`],
      `patches/picomatch@${version}.patch`,
    );
  }
  return verifyPicomatchPatches();
}

const proc = Bun.spawnSync({
  cmd: ["bun", "audit", `--audit-level=${AUDIT_LEVEL}`, "--json"],
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = new TextDecoder().decode(proc.stdout);
const stderr = new TextDecoder().decode(proc.stderr);
const jsonLine = stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("{") && line.endsWith("}"));

if (!jsonLine) {
  if (proc.exitCode === 0) {
    console.log("bun audit passed with no high+ advisories.");
    process.exit(0);
  }
  console.error(stdout || stderr || "bun audit failed without JSON output.");
  process.exit(proc.exitCode || 1);
}

const audit = JSON.parse(jsonLine);
const violations = [];
const accepted = [];

for (const [pkg, advisories] of Object.entries(audit)) {
  for (const advisory of advisories) {
    if (!["high", "critical"].includes(advisory.severity)) continue;
    const id = advisory.url?.split("/").pop() ?? String(advisory.id);
    if (
      pkg !== "picomatch" ||
      id !== PICOMATCH_ADVISORY ||
      advisory.severity !== "high"
    ) {
      violations.push(`${pkg} ${id} (${advisory.severity}) ${advisory.title}`);
      continue;
    }
    try {
      const copies = verifyPicomatchException();
      accepted.push(
        `${pkg} ${id}: ${copies} verified patched copies; expires ${EXCEPTION_EXPIRES} UTC`,
      );
    } catch (error) {
      violations.push(`${pkg} ${id} exception refused: ${error.message}`);
    }
  }
}

if (violations.length > 0) {
  console.error("High+ audit advisories need action:");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    "Document temporary exceptions in docs/security-audit-exceptions.md.",
  );
  process.exit(1);
}

if (proc.exitCode !== 0 && accepted.length === 0) {
  console.error(
    "Bun audit failed without a verified advisory to account for its exit status.",
  );
  process.exit(proc.exitCode || 1);
}

if (accepted.length > 0) {
  console.log("bun audit high+ advisories are explicitly tracked:");
  for (const item of accepted) console.log(`- ${item}`);
} else {
  console.log("bun audit passed with no high+ advisories.");
}
