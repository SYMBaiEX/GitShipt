#!/usr/bin/env bun

const version = Bun.version;
const revision = Bun.revision ?? "unknown";

const stableParts = version
  .split("-")[0]
  .split(".")
  .map((part) => Number.parseInt(part, 10));
const isLatestStableOrNewer =
  (stableParts[0] ?? 0) > 1 ||
  ((stableParts[0] ?? 0) === 1 &&
    ((stableParts[1] ?? 0) > 4 ||
      ((stableParts[1] ?? 0) === 4 && (stableParts[2] ?? 0) >= 4)));

console.log(`Bun ${version} (${revision})`);

if (!isLatestStableOrNewer) {
  console.error("GitShipt requires Bun 1.4.4 or newer.");
  process.exit(1);
}

console.log(
  "HTTP/3 APIs are experimental: Bun.serve({ http3: true }) and fetch(..., { protocol: 'http3' }). Do not use them in production.",
);
