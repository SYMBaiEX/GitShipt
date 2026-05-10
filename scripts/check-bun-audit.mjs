#!/usr/bin/env bun

const AUDIT_LEVEL = "high";
const TODAY = new Date();

const ALLOWED = new Map(
  [
    {
      package: "bigint-buffer",
      advisory: "GHSA-3gc7-fjrx-p6mg",
      severity: "high",
      owner: "platform",
      expires: "2026-06-15",
    },
    {
      package: "fast-xml-builder",
      advisory: "GHSA-5wm8-gmm8-39j9",
      severity: "high",
      owner: "platform",
      expires: "2026-06-15",
    },
  ].map((entry) => [`${entry.package}:${entry.advisory}`, entry]),
);

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
    const key = `${pkg}:${id}`;
    const allow = ALLOWED.get(key);
    if (!allow) {
      violations.push(`${pkg} ${id} (${advisory.severity}) ${advisory.title}`);
      continue;
    }
    if (allow.severity !== advisory.severity) {
      violations.push(
        `${pkg} ${id} severity changed from ${allow.severity} to ${advisory.severity}`,
      );
      continue;
    }
    if (new Date(`${allow.expires}T23:59:59Z`) < TODAY) {
      violations.push(`${pkg} ${id} exception expired on ${allow.expires}`);
      continue;
    }
    accepted.push(`${pkg} ${id} accepted until ${allow.expires}`);
  }
}

if (violations.length > 0) {
  console.error("High+ audit advisories need action:");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error("Document temporary exceptions in docs/security-audit-exceptions.md.");
  process.exit(1);
}

if (accepted.length > 0) {
  console.log("bun audit high+ advisories are explicitly tracked:");
  for (const item of accepted) console.log(`- ${item}`);
} else {
  console.log("bun audit passed with no high+ advisories.");
}
