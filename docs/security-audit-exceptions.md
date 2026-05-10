# Security Audit Exceptions

`bun run security:audit` fails on any high or critical advisory unless it is
listed here and in `scripts/check-bun-audit.mjs` with an owner and expiry.

| Package | Advisory | Path | Severity | Owner | Expires | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| `bigint-buffer` | GHSA-3gc7-fjrx-p6mg | `@bagsfm/bags-sdk` | high | platform | 2026-06-15 | Transitive Solana/Bags dependency. No fixed compatible version is available in the current Bags SDK chain. |
| `fast-xml-builder` | GHSA-5wm8-gmm8-39j9 | `workflow` | high | platform | 2026-06-15 | Transitive Vercel Workflow dependency. Application code does not parse untrusted XML directly, but this must be removed once Workflow ships a fixed chain. |
