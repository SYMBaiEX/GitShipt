# UI and Accessibility Review

Reviewed against [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/). The [WCAG 3.0 Working Draft](https://www.w3.org/TR/wcag-3.0/) informed the review but does not define a stable conformance target. This is an engineering review, not a certification.

## What Changed

- Public, project, owner and admin routes share navigation. On mobile, the header and bottom dock reserve space for device insets and sit outside the scrolling content. Desktop retains the persistent sidebar.
- Navigation drawers, wallet selection and sharing use Radix primitives for keyboard behavior, focus management and accessible control names. The launch wizard moves focus to the current step and exposes progress and pending states.
- Both themes use the same depth, focus and pressed-state tokens. Decorative motion finishes on its own and honors reduced-motion preferences. Forced-colors mode retains visible focus.
- Landing, discovery, sign-in and project views reflow on narrow screens. Snapshot rows stack their details on smaller screens. Wide ranking tables have named, keyboard-scrollable regions.
- Launch and token copy distinguishes owner rewards from informational contributor rankings. No fee, payout, signing or broadcast logic changed.

## How to Verify

- Run `bun run lint`, `bun run typecheck`, `bun run test`, `bun run theme:lint` and `bun --no-env-file run build`. The production build includes the Workflow runtime trace check.
- Use `E2E_BASE_URL` for Playwright against an isolated preview. Use a seeded test database, not live project data, for the populated project and rankings checks. `bun run e2e` covers narrow reflow, dock overlap, app navigation, keyboard focus, reduced motion, sign-in retry, sign-in redirects and project sharing.
- Automated layout coverage spans 20 public routes or entry states, two themes and six screen sizes from 320 to 1440 CSS pixels, including landscape. Run axe at phone and desktop sizes. Use mobile WebKit over HTTPS to exercise safe-area layouts, navigation and the populated snapshot disclosure.
- Before production promotion, verify authenticated owner and admin pages with staging accounts, complete the GitHub and wallet flows with test credentials, and test VoiceOver and TalkBack on real devices. Automated checks do not replace these steps or establish conformance.

## Framework and Dependency Notes

- [Next.js viewport settings](https://nextjs.org/docs/app/api-reference/functions/generate-viewport) keep browser zoom enabled and let the UI account for device insets. Page headings support Next.js route announcements. The proxy redirects anonymous visits; server pages continue to authenticate and authorize protected content.
- [Vercel's Next.js integration](https://vercel.com/docs/frameworks/full-stack/nextjs) supports the existing build and runtime setup. Keep production CSP in preview checks by serving production builds over HTTPS; HTTP is supported for local development.
- Keep Solana web3.js on the Bags SDK-compatible major and preserve the Vercel Queue/Workflow JOSE compatibility pin. This pass did not upgrade dependencies.
- The security audit reported a high-severity [transitive picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The release gate remains open pending a fix or a documented risk decision.
