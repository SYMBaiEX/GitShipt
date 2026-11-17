# Security Audit Exceptions

`bun run security:audit` fails on any high or critical advisory unless it is
listed here and in `scripts/check-bun-audit.mjs` with an owner and expiry.

| Package | Advisory | Path | Severity | Owner | Expires | Reason |
| --- | --- | --- | --- | --- | --- | --- |

There are currently no exceptions. The Bags/Solana dependency on
`bigint-buffer` is overridden by `packages/bigint-buffer`, a pure-JavaScript
implementation of its conversion API. It does not load the native binding
affected by GHSA-3gc7-fjrx-p6mg; the upstream package has no patched release.
The replacement and its SDK dependency resolution have regression tests.
The upstream Solana bigint layout's direct `encode` call requires an explicit
offset of `0`; omitting it produces incorrect bytes on Node 22 and Bun 1.4.
No direct encode call was found in the app or the installed Bags/SPL/Meteora
sources checked. SPL instruction structs supply an offset to their fields.
