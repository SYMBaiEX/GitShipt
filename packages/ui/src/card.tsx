import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@repo/lib";

/**
 * Card primitive — composable shadcn-style.
 *
 * Depth variants:
 *   - flat     : 1px border, no shadow (default for most page cards)
 *   - raised   : light card-elevated shadow + inset highlight (subtle pop)
 *   - floating : full liquid-glass shadow stack (sidebar, popovers, modals)
 *
 * Glass variants:
 *   - none  : opaque surface fill
 *   - glass : translucent + backdrop-blur (use on top of the page bg)
 */
const cardVariants = cva("relative rounded-lg border border-border text-fg", {
  variants: {
    depth: {
      flat: "bg-surface",
      raised: "gb-panel-raised bg-surface shadow-card-elevated",
      floating: "gb-panel-floating shadow-floating",
    },
    glass: {
      none: "",
      glass: "glass",
    },
    padding: {
      none: "",
      sm: "p-4",
      default: "p-6",
      lg: "p-8",
    },
  },
  defaultVariants: { depth: "flat", glass: "none", padding: "default" },
  compoundVariants: [
    // When using glass, surface fill must come from the @utility, not bg-surface.
    { glass: "glass", depth: "flat", className: "" },
  ],
});

export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, depth, glass, padding, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ depth, glass, padding }), className)}
      {...props}
    />
  );
});

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({
  as: Heading = "h3",
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }) {
  return <Heading className={cn("text-headline-sm", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-body-sm text-fg-secondary", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center", className)} {...props} />;
}

export { cardVariants };
