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

## Picomatch local hardening

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
has no upstream release with a fix. Bun applies checked-in patches to
`picomatch@2.3.2` and `picomatch@4.0.7` on a frozen install. The patches
keep the upstream flat character-class rewrite when available and otherwise
treat repeated extglobs literally. They do not affect ordinary glob or
non-repeated extglob matching. `bun run security:patches` checks the behavior
on every package-manager-installed copy.

This does not replace copies bundled internally by frameworks. Next.js's
bundled copy is used with repository-controlled image and build patterns;
do not feed user-provided glob patterns into those configurations. The
version-based audit still reports the advisory and the release gate remains
closed. Remove these patches and their verification when a compatible
upstream fix is available.
