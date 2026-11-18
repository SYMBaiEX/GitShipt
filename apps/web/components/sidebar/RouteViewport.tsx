"use client";

import {
  Suspense,
  useLayoutEffect,
  useRef,
  ViewTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname } from "next/navigation";

const routeMotion = {
  "gb-navigation": "gb-route-swap",
  "dock-next": "gb-route-next",
  "dock-prev": "gb-route-prev",
  "filter-results": "none",
  default: "gb-route-swap",
};

const consoleMotion = { ...routeMotion, default: "none" };

export function RouteViewport({
  children,
  className,
  steady,
}: {
  children: ReactNode;
  className: string;
  steady: boolean;
}) {
  const main = useRef<HTMLElement>(null);
  return (
    <ViewTransition
      name="gitshipt-page"
      default="none"
      enter={routeMotion}
      exit={routeMotion}
      update={steady ? consoleMotion : routeMotion}
      share={routeMotion}
    >
      <main ref={main} id="main-content" tabIndex={-1} className={className}>
        <Suspense fallback={null}>
          <LegacyRouteMotion main={main} />
        </Suspense>
        {children}
      </main>
    </ViewTransition>
  );
}

function LegacyRouteMotion({ main }: { main: RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const didNavigate = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (
      !didNavigate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      ("startViewTransition" in document &&
        CSS.supports("view-transition-class: gb-route-swap"))
    )
      return;

    const animation = main.current?.animate(
      [
        { opacity: 0.8, transform: "translateY(5px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return () => animation?.cancel();
  }, [main, pathname]);

  return null;
}
