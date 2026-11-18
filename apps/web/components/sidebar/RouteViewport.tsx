"use client";

import { useLayoutEffect, useRef, ViewTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const routeMotion = {
  "dock-next": "gb-route-next",
  "dock-prev": "gb-route-prev",
  "filter-results": "none",
  default: "gb-route-swap",
};

export function RouteViewport({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const pathname = usePathname();
  const main = useRef<HTMLElement>(null);
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
  }, [pathname]);

  return (
    <ViewTransition
      name="gitshipt-page"
      default="none"
      enter={routeMotion}
      exit={routeMotion}
      update={routeMotion}
      share={routeMotion}
    >
      <main ref={main} id="main-content" tabIndex={-1} className={className}>
        {children}
      </main>
    </ViewTransition>
  );
}
