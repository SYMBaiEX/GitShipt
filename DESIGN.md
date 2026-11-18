---
version: alpha
name: GitShipt
description: Cypherpunk dark-mode launchpad-leaderboard for open-source repos. Built for on-chain native builders. Density, precision, and a single bone-ink GitShipt logo palette. Ships with mirrored light palette for accessibility and preference parity; dark is the default.
colors:
  # === DARK THEME (default) ===
  # Surfaces — deep blacks with subtle cool bias
  bg: "#08080C"
  surface: "#101015"
  surface-elevated: "#16161E"
  surface-overlay: "#1C1C25"
  border: "#23232E"
  border-strong: "#33333F"

  # Brand — sampled from logo.png bone ink, tuned for dark mode
  primary: "#E6DAC6"
  primary-hover: "#F4EAD7"
  primary-pressed: "#CDBDA2"
  primary-soft: "#241F18"
  primary-fg: "#08080C"
  primary-readable: "#E6DAC6"
  primary-text-shadow: "color-mix(in oklab, black 28%, transparent)"

  # Text
  fg: "#F5F5F7"
  fg-secondary: "#9494A0"
  fg-muted: "#80808C"
  fg-disabled: "#3A3A45"

  # Semantic
  success: "#22C55E"
  success-soft: "#0F2A1A"
  warning: "#EAB308"
  warning-soft: "#2A2110"
  danger: "#EF4444"
  danger-soft: "#2A1414"
  danger-fg: "#FFFAF0"
  info: "#3B82F6"
  info-soft: "#0F1F33"

  # Rank tiers (medals)
  rank-gold: "#FBBF24"
  rank-silver: "#CBD5E1"
  rank-bronze: "#D97706"

  # Charts (sparklines, fee curves)
  chart-1: "#E6DAC6"
  chart-2: "#CDBDA2"
  chart-3: "#22C55E"
  chart-4: "#3B82F6"
  chart-5: "#EAB308"

colors-light:
  # === LIGHT THEME (mirror) ===
  # NON-NORMATIVE EXTENSION: spec allows unknown YAML content; agents and the
  # CSS pipeline read this to derive a [data-theme="light"] override layer.
  # Token names mirror `colors` exactly. Same role, inverted substrate.
  bg: "#FAFAFC"
  surface: "#FFFFFF"
  surface-elevated: "#F4F4F8"
  surface-overlay: "#FFFFFF"
  border: "#E5E5EC"
  border-strong: "#D4D4DD"

  # Brand — bright logo bone for filled controls, with readable text accent
  primary: "#E6DAC6"
  primary-hover: "#F4EAD7"
  primary-pressed: "#CDBDA2"
  primary-soft: "#F3EBDD"
  primary-fg: "#2A2118"
  primary-readable: "#6F5638"
  primary-text-shadow: "color-mix(in oklab, white 46%, transparent)"

  # Text
  fg: "#0F0F14"
  fg-secondary: "#52525B"
  fg-muted: "#6B6B76"
  fg-disabled: "#C4C4CC"

  # Semantic — darkened for AA on white
  success: "#16A34A"
  success-soft: "#DCFCE7"
  warning: "#CA8A04"
  warning-soft: "#FEF9C3"
  danger: "#DC2626"
  danger-soft: "#FEE2E2"
  danger-fg: "#FFFAF0"
  info: "#2563EB"
  info-soft: "#DBEAFE"

  # Rank tiers — darkened to maintain readability on light cards
  rank-gold: "#D97706"
  rank-silver: "#71717A"
  rank-bronze: "#B45309"

  # Charts
  chart-1: "#6F5638"
  chart-2: "#352A1C"
  chart-3: "#16A34A"
  chart-4: "#2563EB"
  chart-5: "#CA8A04"

typography:
  display:
    fontFamily: Geist
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0
  headline-lg:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  headline-md:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0
  headline-sm:
    fontFamily: Geist
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  body-lg:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  label-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  label-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  caption:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0
  mono-display:
    fontFamily: Geist Mono
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  mono-lg:
    fontFamily: Geist Mono
    fontSize: 1.25rem
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0
  mono-md:
    fontFamily: Geist Mono
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  mono-sm:
    fontFamily: Geist Mono
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0

rounded:
  none: 0px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 20px
  full: 9999px

# Multi-layer shadow stack — Liquid Glass / macOS Tahoe depth.
# NON-NORMATIVE EXTENSION: agents and the CSS pipeline read this to emit
# theme-aware shadow tokens. Use `shadows-light:` for the mirrored palette.
shadows:
  # Heavy depth for the floating sidebar, popovers over glass.
  # 4 layers: glass border + top inset highlight + key shadow + ambient.
  floating: "0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.06), 0 12px 28px -8px rgba(0, 0, 0, 0.55), 0 28px 56px -16px rgba(0, 0, 0, 0.4)"
  # Lighter depth for raised cards inside the bento grid.
  card-elevated: "0 0 0 1px rgba(255, 255, 255, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.04), 0 6px 16px -4px rgba(0, 0, 0, 0.35), 0 14px 32px -10px rgba(0, 0, 0, 0.25)"
  # Top-edge catch-light for raised buttons + active sidebar items.
  inset-light: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), inset 0 0 0 1px rgba(255, 255, 255, 0.02)"
  # Inset depression for active/pressed state.
  press: "inset 0 1px 2px 0 rgba(0, 0, 0, 0.25)"
  # Popover (Day-1, kept for backwards compat with existing components).
  popover: "0 8px 24px rgba(0, 0, 0, 0.4)"
  modal: "0 20px 60px rgba(0, 0, 0, 0.6)"

shadows-light:
  floating: "0 0 0 1px rgba(15, 15, 20, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.7), 0 8px 24px -4px rgba(15, 15, 20, 0.12), 0 24px 48px -12px rgba(15, 15, 20, 0.10)"
  card-elevated: "0 0 0 1px rgba(15, 15, 20, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.5), 0 4px 12px -2px rgba(15, 15, 20, 0.08), 0 12px 24px -8px rgba(15, 15, 20, 0.06)"
  inset-light: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.4)"
  press: "inset 0 1px 2px 0 rgba(15, 15, 20, 0.08)"
  popover: "0 4px 16px rgba(15, 15, 20, 0.08)"
  modal: "0 20px 60px rgba(15, 15, 20, 0.15)"

spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 64px
  gutter: 24px
  margin: 32px
  sidebar-width: 240px
  content-max: 1440px

components:
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-elevated:
    backgroundColor: "{colors.surface-elevated}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-interactive:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-interactive-hover:
    backgroundColor: "{colors.surface-elevated}"
    borderColor: "{colors.border-strong}"

  # Sidebar — Liquid Glass / macOS Tahoe floating aesthetic.
  # The sidebar lives in a 12px outer page gutter, never flush to the viewport
  # edge. All four corners rounded `2xl`. Glass surface (color-mix translucent
  # over backdrop blur) + multi-layer floating shadow + top-edge catch-light.
  # Collapsable via SidebarToggle in the header (260px ↔ 68px, 300ms transition).
  # Internal scroll for nav so the header + footer stay pinned.
  sidebar:
    backgroundColor: "color-mix(in oklab, {colors.surface} 70%, transparent)"
    backdropFilter: "blur(20px) saturate(180%)"
    borderColor: "{colors.border}/50"
    rounded: "{rounded.2xl}"
    shadow: "{shadows.floating}"
    width: 260px
    widthCollapsed: 68px
    margin: 12px
  sidebar-item:
    backgroundColor: "transparent"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.md}"
    padding: 10px 12px
    typography: "{typography.label-md}"
  sidebar-item-active:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.fg}"
    shadow: "{shadows.inset-light}"
  sidebar-item-hover:
    backgroundColor: "{colors.surface-elevated}/60"
    textColor: "{colors.fg}"
  # Sidebar header carries the brand mark + SidebarToggle. No icon-in-box for
  # the brand — just the text. When collapsed, header shows only the toggle.
  sidebar-header:
    height: 56px
    padding: 0 12px
    borderBottomColor: "{colors.border}/40"
  # Sidebar footer is the canonical home for the ThemeToggle + sticky cards
  # (TokenSparkCard, UserWalletCard, etc.). Hidden when sidebar collapses.
  sidebar-footer:
    backgroundColor: "{colors.bg}/30"
    borderTopColor: "{colors.border}/40"
    padding: 12px

  # App shell — viewport-locked layout used by every authenticated page.
  # Outer container is `flex h-screen overflow-hidden` so the document never
  # scrolls. Internal regions handle their own overflow:
  #   - sidebar: internal nav scroll
  #   - <main>: bento grid with overflow-y-auto on the right rail
  #   - <footer>: pinned to viewport bottom-right
  # The right column has 16px gutter from the sidebar's right edge (ml-3).
  app-shell:
    outerPadding: 12px # only top/left/bottom — right meets viewport
    columnGap: 12px # sidebar ↔ content
    contentMaxWidth: "{spacing.content-max}"

  # Footer — anchored to viewport bottom-right. Only the top-left corner
  # is rounded (curves toward the sidebar). Bottom + right edges meet the
  # viewport. Uses glass + card-elevated shadow.
  app-footer:
    backgroundColor: "color-mix(in oklab, {colors.surface} 70%, transparent)"
    backdropFilter: "blur(20px) saturate(180%)"
    borderTopColor: "{colors.border}/60"
    borderLeftColor: "{colors.border}/60"
    borderTopLeftRadius: "{rounded.2xl}"
    shadow: "{shadows.card-elevated}"
    padding: 6px 16px
    height: 36px
    marginLeft: 16px # mirrors the main content's left padding

  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: 10px 16px
    typography: "{typography.label-md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
  button-secondary:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.fg}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  button-ghost-hover:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.fg}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: 10px 16px

  pill:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 6px 12px
    typography: "{typography.label-sm}"
  badge-live:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: 4px 10px
    typography: "{typography.label-sm}"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
    padding: 4px 10px

  table:
    backgroundColor: "transparent"
    borderColor: "{colors.border}"
  table-header:
    textColor: "{colors.fg-muted}"
    typography: "{typography.label-sm}"
    padding: 12px 16px
  table-row:
    backgroundColor: "transparent"
    borderColor: "{colors.border}"
    padding: 16px
  table-row-hover:
    backgroundColor: "{colors.surface-elevated}"
  table-cell-numeric:
    typography: "{typography.mono-md}"
    textColor: "{colors.fg}"

  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-strong}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: 10px 14px
    typography: "{typography.body-md}"
  input-focus:
    borderColor: "{colors.primary}"
  input-error:
    borderColor: "{colors.danger}"

  select:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-strong}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: 10px 14px

  modal:
    backgroundColor: "{colors.surface-overlay}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.xl}"
    padding: 32px

  tooltip:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.fg}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.md}"
    padding: 8px 12px
    typography: "{typography.body-sm}"

  # Avatars are NOT round in GitShipt — they're rounded squares matching the
  # design system's radius family. The radius scales with avatar size so the
  # visual weight stays proportional to the surrounding cards.
  #   sidebar (260px wide): rounded-2xl (20px)
  #   project header avatar (72-112px): rounded-2xl (20px)
  #   contributor row avatar (32px): rounded-lg (12px)
  #   smaller meta avatars (24px): rounded-md (8px)
  # Status dots, pulse indicators, rank medals stay round (they're affordances,
  # not pictures).
  avatar:
    rounded: "{rounded.lg}"
    size: 32px
  avatar-md:
    rounded: "{rounded.xl}"
    size: 48px
  avatar-lg:
    rounded: "{rounded.2xl}"
    size: 72px
  avatar-xl:
    rounded: "{rounded.2xl}"
    size: 112px

  stat-card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: 20px

  # QuickStat / TokenStat — floating stat cell used in horizontal grid strips
  # (header repo info, token-stats row). Soft border + subtle bg so they read
  # as a strip rather than as boxed modules.
  quick-stat:
    backgroundColor: "{colors.surface}/40"
    borderColor: "{colors.border}/60"
    rounded: "{rounded.lg}"
    padding: 8px 12px

  # Dropdown menu — used by TokenActionsMenu (Embed / Copy CA / GitHub) and
  # any other action menu. Glass surface with the popover shadow stack.
  dropdown-menu:
    backgroundColor: "color-mix(in oklab, {colors.surface-overlay} 85%, transparent)"
    backdropFilter: "blur(24px) saturate(180%)"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.lg}"
    shadow: "{shadows.popover}"
    padding: 4px
  dropdown-menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.md}"
    padding: 6px 10px
    typography: "{typography.body-sm}"
  dropdown-menu-item-hover:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.fg}"

  # Embed widget — minimal-chrome widget designed for iframe embedding on
  # third-party sites. Lives at /embed/r/{org}/{repo}, transparent body,
  # robots:noindex. Default iframe size: 380×360px.
  embed-widget:
    rounded: "{rounded.lg}"
    minWidth: 320px
    defaultWidth: 380px
    defaultHeight: 360px

  rank-medal-gold:
    backgroundColor: "{colors.rank-gold}"
    textColor: "{colors.bg}"
    rounded: "{rounded.full}"
  rank-medal-silver:
    backgroundColor: "{colors.rank-silver}"
    textColor: "{colors.bg}"
    rounded: "{rounded.full}"
  rank-medal-bronze:
    backgroundColor: "{colors.rank-bronze}"
    textColor: "{colors.bg}"
    rounded: "{rounded.full}"
---

# GitShipt Design System

## Overview

GitShipt is a launchpad-leaderboard hybrid for open-source repos on Solana, powered by Bags.fm. The visual identity sits squarely in the **cypherpunk-dark-bone** territory: near-black surfaces, a single bone-and-ink accent sampled from `logo.png`, monospace numerics, and zero ornamental gradients. Every pixel is in service of conveying motion, money, and merit at a glance.

Emotional target: A trader's terminal that respects the engineer behind every commit. It should feel late-night, focused, and slightly dangerous. Confident enough that putting your repo on it is a flex; legible enough that a maintainer who's never touched a wallet can still understand who is being paid and why.

Density is a feature. Information per square inch should beat any traditional SaaS dashboard. Cards have generous internal padding (24px) but tight inter-card gutters (16-24px). Tables are dense but never cramped: 12-16px row padding, monospace numerics, never wrap.

This is **not** a playful product. No rounded illustrations, no mascot pages, no springy bounce animations. Motion is restricted to subtle transitions (opacity, transform), countdown timers, sparklines, and live indicators.

Route changes settle in about 215ms while the header, sidebar, and dock stay
fixed. Mobile tabs move in their visible order; wizard steps follow progress.
Reduced motion removes travel and fades without delaying the navigation.

## Colors

The palette is built around a single signature accent (GitShipt logo bone) over a deep neutral substrate biased slightly toward cool. Every other color is utility. **Dark is the default and the canonical aesthetic**; a mirrored light palette ships for accessibility, preference parity, and presenters who demo on bright projectors.

### Theming model

GitShipt ships **two palettes** in this DESIGN.md:

- **`colors:`** is the dark palette and the canonical token set. All prose, all examples, and all default rendering targets dark.
- **`colors-light:`** is a mirrored light palette. Token names match `colors:` exactly so every component automatically gets a correct light variant via CSS variable redirection. This key is a non-normative extension; the spec tolerates unknown YAML content and the lint passes cleanly.

Theme is selected via `data-theme="dark"` (default) or `data-theme="light"` on the `<html>` element. Implementation uses `next-themes` with `attribute="data-theme"` and `defaultTheme="system"` (falls through to `dark` if no system preference is detected). Both palettes are emitted as CSS custom properties under `:root` (dark) and `[data-theme="light"]` (light overrides), then routed through Tailwind v4's `@theme inline` so utility classes like `bg-surface` resolve correctly per theme without rebuilds.

### Dark palette (canonical)

- **Background (#08080C):** Page substrate. Near-black with a microscopic cool tint that lets the bone brand accent stay crisp without calling attention to itself.
- **Surface (#101015):** Default card background. The primary content layer.
- **Surface Elevated (#16161E):** Hover states, sidebar selection, active rows. One step closer to the user.
- **Surface Overlay (#1C1C25):** Modals, popovers, tooltips. The layer above the layer.
- **Border (#23232E):** Default 1px borders for cards and table rows. Visible but never loud.
- **Border Strong (#33333F):** Inputs, prominent dividers, focused emphasis.
- **Primary (#E6DAC6):** The signature logo bone. Used exclusively for: brand mark, primary CTA, current SOL amounts, leaderboard score column header, sparkline strokes, active sidebar item indicator. **One primary per visible viewport** is the working ceiling.
- **Primary Soft (#241F18):** Warm ink-bone background for pills, hover states, soft callouts.
- **Foreground (#F5F5F7):** Primary text. Off-white, never pure white (which would feel sterile against the warm-cool surfaces).
- **Foreground Secondary (#9494A0):** Secondary text, table headers, descriptions.
- **Foreground Muted (#80808C):** USD price subtext, captions, timestamps, breadcrumbs.
- **Success (#22C55E):** Live indicators, gains, "Cron Active" status, positive deltas.
- **Danger (#EF4444):** Kill switches, errors, losses, destructive confirmations.
- **Warning (#EAB308):** Pending payouts, advisory copy, throttle warnings.
- **Info (#3B82F6):** Informational notices, banner inserts.
- **Rank Gold/Silver/Bronze:** Medal icons for top-3 contributors. Used only on the leaderboard.

### Light palette (mirrored)

The light palette inverts the substrate (off-white `#FAFAFC` instead of near-black) while preserving role semantics. Surfaces step up: `bg` is `#FAFAFC`, `surface` is pure white, `surface-elevated` is `#F4F4F8`. Borders flip to light grays. Filled primary controls keep the bright logo-bone surface in both themes and use warm-ink `primary-fg`; standalone accent text uses `primary-readable` so links, icons, and numeric accents maintain WCAG AA contrast on white.

Semantic colors (success, warning, danger, info) all darken proportionally and pair with light tinted backgrounds (e.g., `success-soft: #DCFCE7`). Rank medals shift to richer, lower-luminance tones so they read as gold/silver/bronze against light cards rather than pastel washes.

The substrate is intentionally **off-white, not pure `#FFFFFF`**. Pure white is sterile and amplifies any subpixel rendering issues in mono numerics. `#FAFAFC` is just warm enough to feel premium without losing the engineered feel.

WCAG: All foreground/surface combinations exceed 4.5:1 contrast in both palettes. The single exception is `fg-disabled` against `bg`, which is intentionally low-contrast and used only for disabled controls.

### Implementation pattern (Tailwind v4)

```css
/* app/globals.css */
@import "tailwindcss";

:root {
  /* Dark palette is the default, exported by `bunx @google/design.md export` */
  --bg: #08080c;
  --surface: #101015;
  --surface-elevated: #16161e;
  --surface-overlay: #1c1c25;
  --border: #23232e;
  --border-strong: #33333f;
  --primary: #e6dac6;
  --primary-hover: #f4ead7;
  --primary-pressed: #cdbda2;
  --primary-soft: #241f18;
  --primary-fg: #08080c;
  --primary-readable: #e6dac6;
  --primary-text-shadow: color-mix(in oklab, black 28%, transparent);
  --fg: #f5f5f7;
  --fg-secondary: #9494a0;
  --fg-muted: #80808c;
  /* ...and so on */
}

[data-theme="light"] {
  /* Light palette overrides — token names mirror :root exactly */
  --bg: #fafafc;
  --surface: #ffffff;
  --surface-elevated: #f4f4f8;
  --surface-overlay: #ffffff;
  --border: #e5e5ec;
  --border-strong: #d4d4dd;
  --primary: #e6dac6;
  --primary-hover: #f4ead7;
  --primary-pressed: #cdbda2;
  --primary-soft: #f3ebdd;
  --primary-fg: #2a2118;
  --primary-readable: #6f5638;
  --primary-text-shadow: color-mix(in oklab, white 46%, transparent);
  --fg: #0f0f14;
  --fg-secondary: #52525b;
  --fg-muted: #6b6b76;
  /* ...and so on */
}

@theme inline {
  /* `inline` keeps CSS variables resolvable at runtime so theme switches don't require a rebuild */
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-primary: var(--primary);
  --color-fg: var(--fg);
  /* ...and so on */
}
```

Components reference utility classes (`bg-surface`, `text-fg`, `border-border`) and the right palette renders automatically based on the `data-theme` attribute. No JavaScript needed at the component level.

## Typography

Two type families:

- **Geist (sans):** Default for all UI text. Modern, geometric, technical without being cold. Open-source under SIL.
- **Geist Mono:** All numeric values that benefit from tabular alignment — SOL amounts, USD subtotals, scores, timestamps, wallet addresses, transaction hashes. Critical for the leaderboard, payout history, and admin tables.

Hierarchy is tight. Most surfaces use only 2-3 levels.

- **Display (48px):** Reserved for landing page hero and the live "Daily Fee Pool" amount on the project page.
- **Headline LG (32px):** Page titles inside the dashboard.
- **Headline MD (24px):** Section titles ("Leaderboard", "Pool Overview", "Recent Payouts").
- **Headline SM (18px):** Card titles, modal titles.
- **Body LG (16px):** Description copy, longer paragraphs.
- **Body MD (14px):** Default body text and most table cells.
- **Body SM (12px):** Secondary descriptions, table sub-rows (USD prices).
- **Label MD (14px):** Buttons, sidebar items, field labels.
- **Label SM (12px):** Pills, badges, status chips.
- **Caption (11px):** Timestamps, footer notes, meta lines.
- **Mono MD (14px):** Numeric values in tables, code, transaction signatures.
- **Mono SM (12px):** Tight numerics, meta, escrow IDs.

Body text is **400 weight**. Labels, headings, and UI emphasis are **500 or 600**. Bold (700+) is reserved for the brand mark and the page hero only.

Letter spacing is neutral across display, headline, body, label, caption, and mono utilities. Do not introduce ad hoc tracking classes in components.

## Layout — App Shell

GitShipt uses a **viewport-locked app shell** for every authenticated page (`/r/[org]/[repo]`, `/dashboard/*`, `/admin/*`, `/launch`). The page itself never scrolls — only specific inner regions do. This lets the sidebar, the page footer, and any system-level chrome stay in view at all times while users browse content.

```
┌─────────────────────────────────────────┐
│  ┌──────┐  ┌────────────────────────┐  │  ← 12px top gutter
│  │      │  │                        │  │
│  │ side │  │  scrollable content    │  │  ← 12px between
│  │ bar  │  │  (bento grid)          │  │
│  │      │  │                        │  │
│  │ glass│  │                        │  │
│  │ pane │  │                        │  │
│  │      │  └────────────────────────┘  │  ← 12px before footer
│  │      │  ┌────────────────────────┐  │
│  │      │  │ footer (rounded-tl,    │  │  ← flush to viewport
│  └──────┘  │ flush right + bottom)  │  │     bottom-right
│            └────────────────────────┘  │
└─────────────────────────────────────────┘
   ↑ 12px left gutter
```

**Outer wrapper**: `flex h-screen overflow-hidden bg-bg text-fg`. The outer `<div>` is the only thing tied to viewport height; everything inside flows from there.

**Sidebar column**: `<div class="shrink-0 p-3 pr-0">` — wraps the floating sidebar in a 12px gutter on top/left/bottom. No right padding so the gap between sidebar and content is owned by the right column.

**Right column**: `<div class="flex min-w-0 flex-1 flex-col">` containing main + footer.

- `<main class="min-w-0 flex-1 overflow-y-auto px-4 pt-4 pb-3 lg:overflow-hidden">` — at lg+ no scroll (bento fits the viewport); below lg falls back to vertical scroll for small screens.
- `<footer class="shrink-0 ml-3 rounded-tl-2xl border-t border-l border-border/60 glass shadow-card-elevated surface-highlight">` — anchored bottom-right, only top-left rounded (curves toward sidebar), bottom + right meet viewport. 16px ml mirrors main's px-4 inset so the footer aligns with the content column.

**Content max width**: 1440px (`max-w-content`). Content gets centered inside `<main>` when the viewport is wider.

Spacing rhythm follows a **4px base** with an **8px primary scale**. Component internal padding is 24px (cards), 16px (table rows), 12px (sidebar items), 10px (buttons). Inter-card gutters are **12px (tight, right rail) / 16px (default, bento) / 24px (loose, hero sections)**.

## Liquid Glass / Depth System

GitShipt ships a **macOS Tahoe-flavored Liquid Glass** depth system that complements the flat-by-default cards. Three classes of surface:

1. **Flat** (`bg-surface` + `border border-border`) — most cards, table rows, form fields. No shadow. Hierarchy from tonality and borders alone.
2. **Raised** (`bg-surface` + `shadow-card-elevated`) — leaderboard card, token-info embed widget, stat tiles. Lifts subtly off the page bg.
3. **Floating** (`glass` utility + `shadow-floating` + `surface-highlight`) — sidebar, popovers, modals, app footer. Translucent glass over a multi-layer shadow stack with a top-edge catch-light gradient.

### Multi-layer shadow stack

Each "depth" shadow is composed of **4 layers**:

1. **Glass border** — `0 0 0 1px rgba(255,255,255,0.05)` (dark) / `rgba(15,15,20,0.06)` (light). 1px hairline that catches ambient light along the edge.
2. **Top inset highlight** — `inset 0 1px 0 0 rgba(255,255,255,0.06)` (dark) / `rgba(255,255,255,0.7)` (light). Mimics the top edge of physical glass catching room light.
3. **Key shadow** — `0 12px 28px -8px rgba(0,0,0,0.55)` (dark, floating). The dominant directional shadow.
4. **Ambient shadow** — `0 28px 56px -16px rgba(0,0,0,0.4)` (dark, floating). Soft envelope that grounds the surface in space.

Light theme inverts the inset highlight to white (catching light against the white substrate) and dampens the key/ambient layers — high-luminance bgs make heavy shadows look smudgy.

### Glass utility

```css
@utility glass {
  background-color: color-mix(in oklab, var(--surface) 70%, transparent);
  backdrop-filter: blur(20px) saturate(180%);
}
@utility glass-strong {
  background-color: color-mix(
    in oklab,
    var(--surface-overlay) 85%,
    transparent
  );
  backdrop-filter: blur(24px) saturate(180%);
}
```

`color-mix` lets the underlying page color tint the glass slightly when content scrolls beneath. `saturate(180%)` boosts the residual color so the tint reads as warm/cool rather than gray. Pair with `shadow-floating` for the canonical Liquid Glass look (sidebar, popovers); `glass-strong` for popovers/modals where contrast is critical.

### Surface highlight class

```css
.surface-highlight::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--fg) 5%, transparent) 0%,
    transparent 28%
  );
  pointer-events: none;
}
```

A subtle gradient on the top edge of glass surfaces. Reads as catch-light on the curve of the rounded corner. Tailwind v4's `@utility` can't carry pseudo-elements, so this is a plain CSS class.

### Press / inset states

`shadow-press` — `inset 0 1px 2px 0 rgba(0,0,0,0.25)` for active buttons / pressed sidebar items. Mirrors the depression you'd feel on a physical key.

### What stays flat

Cards in the bento grid, table rows, form fields, the project header (which floats directly on `bg`, no card wrapper). The page IS still flat-by-default; the depth system is reserved for chrome (sidebar, footer, popovers, modals) and a few intentional anchor cards (leaderboard, embed widget).

## Bento Grid (Project Page Layout)

The canonical reference layout is `/r/[org]/[repo]`. It uses a **3-row CSS grid** that fills the viewport exactly (no document scroll on lg+). Each cell holds a free-standing region; whitespace between cells does the work that card borders would do in a denser layout.

```
Row 1 (auto): ProjectHeader   | RepoStatsList   ← header + repo stats list
Row 2 (auto): TokenStatsRow   | aside (rowspan 2)  ← token strip + right rail starts
Row 3 (1fr):  LeaderboardTable| ↓ aside continues (countdown / pool / payouts)
```

```html
<main class="lg:overflow-hidden">
  <div
    class="grid h-full gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_auto_minmax(0,1fr)]"
  >
    <ProjectHeader />
    <!-- row 1 col 1 -->
    <RepoStatsList />
    <!-- row 1 col 2, self-start -->
    <TokenStatsRow />
    <!-- row 2 col 1 only — must NOT span both -->
    <aside lg:row-start-2 lg:row-span-2>
      <!-- col 2, spans rows 2-3 -->
      <NextPayoutCountdown />
      <PoolOverviewCard />
      <RecentPayoutsFeed />
    </aside>
    <LeaderboardTable />
    <!-- row 3 col 1 -->
  </div>
</main>
```

**Bento principles**:

- **Header sections float (no card wrapper)**. ProjectHeader is just avatar + name + description + Share menu, sitting directly on `bg`. RepoStatsList is a divide-y list of label/value rows with no enclosing border.
- **Anchor cards get raised depth**. LeaderboardTable, PoolOverviewCard, TokenInfoCard (embed) — these are visual anchors and use `Card depth="raised"`.
- **Width discipline**: TokenStatsRow lives in the leaderboard column (col 1 only) — never span cols. The right rail column (col 2) gets the countdown + pool + payouts only.
- **Internal scroll where needed**: Leaderboard's contributor list uses `flex-1 min-h-0 overflow-y-auto` so it consumes whatever vertical space is left after header + column header + footer.
- **Mobile (< lg)** falls back to single column + main `overflow-y-auto`. Components with internal scroll cap their max-h so they don't dominate small screens.

## Reusable Primitive Library

Live at `components/ui/*`. Compose pages from these — never reach for raw HTML+Tailwind when a primitive exists. Each is shadcn-style: variant-driven via `class-variance-authority`, polymorphic where helpful via an `asChild` prop.

| Primitive                                              | File                        | Variants / API                                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                               | `components/ui/button.tsx`  | `variant`: primary / secondary / ghost / danger / outline / link · `size`: sm / default / lg / icon / icon-sm · `asChild` for polymorphism                                             |
| `Card` + `CardHeader/Title/Description/Content/Footer` | `components/ui/card.tsx`    | `depth`: flat / raised / floating · `glass`: none / glass · `padding`: none / sm / default / lg                                                                                        |
| `Badge`                                                | `components/ui/badge.tsx`   | `variant`: default / primary / success / warning / danger / info / outline · `size`: sm / default / lg · `dot` prop with optional `dotColor` (renders the canonical pulsing status dot) |
| `Pill`                                                 | `components/ui/pill.tsx`    | `variant`: primary / neutral / success / warning / danger · `size`: sm / default · `interactive` for clickable styling                                                                 |
| `Sidebar` family                                       | `components/ui/sidebar.tsx` | `SidebarProvider` (context), `Sidebar` (the floating glass shell), `SidebarHeader/Content/Footer/Section/Item/Toggle/Divider`. Internal collapse state with localStorage persistence.  |

Every primitive uses design tokens internally — consumers never pass raw hex. Theme switches are automatic via `data-theme` on `<html>`.

**Avatar** is intentionally NOT a primitive — render with `next/image` directly (or `<img>` for small/dynamic avatars) and apply the radius ladder by size:

- 32px (contributor row): `rounded-lg` (12px)
- 48px (compact hero): `rounded-xl` (16px)
- 72-112px (project hero): `rounded-2xl` (20px)

This keeps the visual rhythm proportional — avatars match the radius family of the surrounding cards (sidebar 20px → cards 12px → buttons 8px).

## Embed Widget Pattern

The TokenInfoCard at `app/r/[org]/[repo]/_components/TokenInfoCard.tsx` doubles as the canonical **embed widget**. Anyone can drop it into their own site via:

```html
<iframe
  src="https://gitshipt.com/embed/r/{org}/{repo}"
  width="380"
  height="360"
  style="border:0;border-radius:12px;color-scheme:light dark"
  loading="lazy"
></iframe>
```

The `/embed/r/[org]/[repo]` route uses a stripped layout (transparent body, no sidebar/footer, `robots: noindex`) so iframes render only the widget. The Share dropdown in the project header has a one-click "Embed" copy that emits the snippet with the current origin substituted.

**Convention for new embeddable surfaces**: route under `/embed/*`, override body bg in a route-group `layout.tsx`, set `robots: noindex`, default iframe size sized to a single card.

## Shapes

Corner radius is **moderate and consistent**. Never sharp (4px or less) is the floor; rounded-full is reserved for affordances only (status dots, pulse indicators, rank medals).

- Buttons, inputs: 8px (`md`)
- Small avatars (≤32px): 12px (`lg`)
- Cards, medium avatars: 12-16px (`lg` / `xl`)
- Modals, large hero avatars, sidebar, floating panels: 20px (`2xl`)
- Status dots, pulse indicators, rank medals only: full circle (`full`)

Mixing radii within a single sibling group is forbidden (e.g., a card with `lg` corners shouldn't house a button with `xl` corners). The avatar radius ladder by size is the only place radii intentionally vary across siblings.

## Components

### Buttons

Use the `Button` primitive from `components/ui/button.tsx`. Variants: `primary` (the only logo-bone button on a screen — DESIGN rule), `secondary` (elevated surface + strong border), `ghost` (subtle until hover), `danger` (destructive admin), `outline`, `link`. Sizes: `sm`, `default`, `lg`, `icon`, `icon-sm`. `asChild` lets you wrap a `<Link>` (renders the link with button styling).

Controls use modern skeuomorphism: a consistent top-left light source, beveled rims, crisp contact lips, softer ambient lift, and a depressed active state. This is intentionally "milled hardware", not glossy candy UI. The control stack uses separate key and ambient shadows so important actions visibly lift from the terminal surface without resorting to glow halos. Any raw button-like surface must opt into the shared `gb-control` classes (`gb-control-primary`, `gb-control-secondary`, `gb-control-ghost`, `gb-control-icon`, `gb-control-cluster`, or `gb-menu-item`) so hover, focus, active, disabled, touch-target, and reduced-motion behavior stays coherent.

Inactive route/navigation links are the exception: use `gb-route-link gb-route-link-inactive` so unselected routes stay quiet and flat while the selected route keeps the tactile active state.

### Pills and badges

Use `Pill` (`components/ui/pill.tsx`) for clickable affordances and `Badge` (`components/ui/badge.tsx`) for passive status. Both rounded-full, semantic variants. `Badge` accepts a `dot` prop that renders the canonical 6px pulsing status dot prefix (use `dotColor` to override the dot's semantic color independent of variant). The "How Scoring Works", "View on Bags.fm", filter tags -> Pill. The "Live", "Paused", "Killed", "Cron Active" indicators -> Badge with `dot`.

### Cards

Use the `Card` primitive from `components/ui/card.tsx` with `depth` + `glass` + `padding` variants. Defaults: `surface` background, 1px `border`, `rounded-lg` (12px), `padding="default"` (24px). Variants:

- `depth="flat"` (default) — no shadow.
- `depth="raised"` — `shadow-card-elevated` (the leaderboard, the embed widget).
- `depth="floating"` — `shadow-floating` (the sidebar internally uses this; rarely needed elsewhere).
- `glass="glass"` — adds the translucent backdrop-blur surface.

Composable subparts: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.

### Tables

Header row: 12px vertical padding, `fg-muted` text, label-sm typography, no top border, 1px bottom border. Data rows: 16px vertical padding, 1px bottom border (none on the last row). Numeric cells use mono. Hover brightens the row to `surface-elevated`. Top-3 ranks use a colored circular medal icon (gold/silver/bronze) in the rank column.

### Sidebar

Floating Liquid Glass aside (260px expanded, 68px collapsed, 300ms transition). Lives in a 12px outer page gutter, never flush to viewport edges. All four corners `rounded-2xl`. Built from the `components/ui/sidebar.tsx` primitive set.

Structure:

- **Header (56px)**: brand text only — no boxed icon — plus a `SidebarToggle` (chevron rotates 180° when open). When collapsed, header shows only the toggle.
- **Content** (flex-1 with internal scroll): nav items grouped via `SidebarSection` with optional uppercase caption titles.
- **Footer**: hosts `ThemeToggle` + sticky context cards (`TokenSparkCard`, `UserWalletCard` on project sidebar). Cards hide when collapsed so the icon rail stays clean.

Items are 10×12 padded, `label-md` typography, `fg-secondary` by default. Active: `surface-elevated` background + `fg` text + `shadow-inset-light` (subtle inner highlight, no left-border accent). Hover: `surface-elevated/60`. Icons are 16px Lucide, left-aligned with 12px gap to label. When collapsed, item label becomes `sr-only`, icon centers, full text appears as a `title` tooltip on hover.

State: `SidebarProvider` exposes `collapsed` + `toggle()` via React Context. Persisted to `localStorage["gitshipt:sidebar:collapsed"]` after mount (hydration-safe).

### Inputs

8px corner radius, `surface` background, `border-strong` border, `body-md` typography, 10×14 padding. Focus state: border becomes `primary`. Error state: border becomes `danger`, helper text in `danger` below.

### Stat cards

Large numeric value in `display` or `headline-lg`, label below in `label-sm` `fg-secondary`. Sparkline (when present) sits to the right or below the number, using `chart-1` (primary logo bone) as stroke. Used in Pool Overview, admin Money Console, project Overview.

### Avatars

**Rounded squares, never circles** (round is reserved for affordances — status dots, pulse indicators, rank medals). Radius scales with size to keep proportional weight relative to surrounding cards:

| Context                     | Size                  | Radius                      |
| --------------------------- | --------------------- | --------------------------- |
| Contributor row             | 32px                  | `rounded-lg` (12px)         |
| Compact hero / inline       | 48px                  | `rounded-xl` (16px)         |
| Project hero (avatar block) | 72-112px (responsive) | `rounded-2xl` (20px)        |
| Sidebar brand mark          | n/a                   | (text only — no boxed icon) |

GitHub `avatar_url` is the source of truth (`https://github.com/{username}.png`). Top-3 leaderboard ranks get a colored circular `RankMedal` (gold/silver/bronze) — that's a separate primitive in the rank column, NOT a medal overlay on the avatar.

### Modals

24px-32px internal padding, 16px corner radius, `surface-overlay` background, 1px `border-strong` border, with a backdrop of `bg/60` plus `backdrop-blur-md`. Close button top-right. **Destructive confirmation modals** (kill switch, force payout, project delete, fee change) use the `<DestructiveConfirmModal>` from `components/admin/` and enforce: reason string ≥20 chars, typed-name confirmation matching target, MFA reverify within last 5 min. Wrapped server-side by `destructiveAction()` in `lib/auth/destructive-action.ts`.

### Dropdown menus

Used for the Share menu in the project header (Embed / Copy CA / GitHub) and any other contextual action menu. Hand-rolled (no Radix dep): click-outside + Escape close, glass surface (`glass-strong + shadow-popover`), `z-30` so it floats above bento cards. Items are 6×10 padded with `body-sm fg-secondary`, hover to `surface-elevated fg`. Trigger button uses `ChevronDown` that rotates 180° when open. Reference: `app/r/[org]/[repo]/_components/TokenActionsMenu.tsx`.

### Copy buttons

Tiny client islands (~20 lines each, `app/r/[org]/[repo]/_components/CopyButton.tsx`). Show a `Copy` icon by default; swap to a success-colored `Check` for 1.5s after a successful `navigator.clipboard.writeText()`. Used for contract addresses, embed snippets, payout signatures, snapshot Merkle roots. Keep host components server-rendered — only this island ships JS.

### Tooltips

12-line max wrap, 8×12 padding, `surface-overlay` background, 1px `border-strong` border, 8px corner radius, `body-sm` typography. 200ms delay on hover.

### Empty states

Centered card-content, 64×64 Lucide icon in `fg-muted`, `headline-sm` title, `body-md fg-secondary` description, primary CTA button below. Never use illustrated graphics.

### Charts (sparklines, bars)

Recharts. Stroke 2px, no axis labels for sparklines, axis labels only when the data is the whole point of the card. Tooltip on hover uses the standard tooltip component. Color palette: `chart-1` through `chart-5`. Always logo-first (`chart-1` is `primary`).

## Do's and Don'ts

- **Do** use the primary logo-bone accent for one element per visible viewport — the most important interactive element on screen. Everything else is white, gray, or semantic.
- **Don't** stack primary elements (pill + button + chart line all primary in the same fold). Pick one.
- **Do** use mono for every number that has economic meaning: SOL amounts, USD prices, scores, basis points, token counts.
- **Don't** use mono for body copy, headings, or descriptive text.
- **Do** maintain WCAG AA contrast everywhere except disabled controls, **in both themes**.
- **Don't** use pure black (#000) or pure white (#FFF). They feel sterile against the cool-biased surfaces. Use `bg` and `fg` tokens.
- **Do** show live data with a small pulsing green dot prefix (countdown timers, cron status, real-time pools).
- **Don't** use animated illustrations, lottie files, or bouncy springs. Motion is functional only.
- **Do** keep cards on a single tonal step (`surface` or `surface-elevated`, never half-tinted).
- **Don't** mix corner radii across sibling elements — if a card is `lg` (12px), the buttons inside it should be `md` (8px), not `xl`.
- **Do** show USD prices as small `fg-muted` subtext beneath the SOL value in mono.
- **Don't** abbreviate SOL amounts below 4 decimals. Mono alignment depends on consistent precision.
- **Do** treat numbers as the visual center of every screen. Tables, stat cards, and charts are the product.
- **Don't** decorate empty states with illustrations. Use a single Lucide icon and clear copy.
- **Do** prefix every administrative table row with a status indicator (live, paused, killed, pending).
- **Don't** use red as decoration. Red is reserved for destructive intent or live errors.

### Theming rules

- **Do** reference design tokens via utility classes (`bg-surface`, `text-fg`, `border-border`). Both themes resolve correctly without component changes.
- **Don't** hard-code hex values in components. Ever. The whole point of two-theme parity is automatic correctness.
- **Do** test every screen in both themes before merging. The QA bar is identical: same density, same contrast, same legibility.
- **Don't** use opacity tricks (`primary/20`, `fg/50`) for theme-aware effects. The light palette has explicit `*-soft` tokens; use those.
- **Do** use `next-themes` `useTheme()` only inside the toggle component itself. Components never read the theme; they just use tokens.
- **Don't** assume dark for chart colors. The `chart-1` through `chart-5` tokens shift between palettes; charts that hardcode hex will have broken contrast in light mode.
- **Do** persist the user's choice (`next-themes` does this automatically via `localStorage`), but default to `system` so first-load matches the OS preference.
- **Don't** ship a flash-of-wrong-theme. Use the inline-script pattern from `next-themes` and `suppressHydrationWarning` on `<html>` in the App Router root layout.

### Composition rules (added after the project-page build)

- **Do** compose pages from `components/ui/*` primitives (`Button`, `Card`, `Badge`, `Pill`, `Sidebar` family). Reach for raw HTML+Tailwind only when no primitive fits — and add a new primitive if you find yourself rolling the same pattern twice.
- **Don't** rebuild the sidebar shell, button variants, or card depth styles inline. Those are owned by the primitive library; consumers compose with props (`variant`, `depth`, `glass`, `padding`, `size`, `dot`).
- **Do** use the bento grid pattern (see "Bento Grid" above) for any new dashboard / admin page that should fit the viewport. Mobile falls back to vertical scroll automatically.
- **Don't** wrap every section in a Card. Floating components (text + chips directly on `bg`) carry equal weight when the page is built around the bento philosophy. Reserve `Card depth="raised"` for the visual anchor of each region.
- **Do** put admin actions in the Share-style dropdown menu (`TokenActionsMenu` reference). Hand-rolled menu, no Radix dep, click-outside + Escape close.
- **Don't** put long status text in the project header. Status signals live in the sidebar nav (badge on the active item) and the app footer (status pill + slug). Header stays focused on identity (avatar, name, repo, ticker).
- **Do** match the radius of an avatar to its size (32→12px, 48→16px, 72-112→20px). The radius ladder is intentional — it pairs with the surrounding cards so the visual rhythm reads as a family.
- **Don't** make avatars circular. Round is reserved for affordances (status dots, pulse indicators, rank medals).
- **Do** use `glass` + `shadow-floating` together for any chrome that should feel detached from the page (sidebar, popovers, modals, app footer). Don't use either alone — the catch-light highlight + multi-layer shadow + translucent surface only read as "glass" in combination.
- **Don't** use depth on inline content cards (TokenStatsRow, RepoStatsList, ProjectHeader). Those float on `bg` with subtle borders; depth would make them compete with the leaderboard / pool anchors.
- **Do** keep the embed widget (`/embed/r/[org]/[repo]`) and the inline TokenStatsRow visually distinct. Embed = full Card (with depth, full token info layout). Inline = horizontal stat strip (no card wrapper, fits the project page's bento). They share the data layer (`getTokenStats()`) but render differently for their context.
