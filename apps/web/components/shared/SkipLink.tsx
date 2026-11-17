/**
 * SkipLink — accessible "skip to main content" anchor.
 *
 * Visually hidden until it receives keyboard focus (Tab from address bar /
 * top of page). When focus-visible, it surfaces as a pill in the top-left so
 * keyboard and screen-reader users can jump past the sidebar / header into
 * the page's primary content region.
 *
 * Targets the route shell's actual `<main id="main-content">` so keyboard
 * users skip sidebar/header chrome, not just the root wrapper.
 *
 * Tokens-only (no raw hex). Uses the `bg-primary / text-primary-fg` pairing for the
 * highest-contrast affordance once focused.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-[max(1rem,env(safe-area-inset-left))] focus-visible:top-[max(1rem,env(safe-area-inset-top))] focus-visible:z-50 focus-visible:inline-flex focus-visible:items-center focus-visible:gap-2 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-3 focus-visible:py-2 focus-visible:text-label-md focus-visible:text-primary-fg focus-visible:shadow-floating focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      Skip to content
    </a>
  );
}
