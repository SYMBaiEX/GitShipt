"use client";

import * as React from "react";
import { cn } from "@repo/lib";
import {
  STEADY_STATE_CADENCE_OPTIONS,
  type SteadyStateCadenceHours,
} from "@repo/shared";

const LABELS: Record<SteadyStateCadenceHours, { primary: string; sub: string }> = {
  72: { primary: "Every 3 days", sub: "Most contributor activity" },
  120: { primary: "Every 5 days", sub: "Moderate cadence" },
  168: { primary: "Every 7 days", sub: "Slower iteration" },
};

export interface CadenceSelectorProps {
  value: SteadyStateCadenceHours;
  onChange: (value: SteadyStateCadenceHours) => void;
  className?: string;
}

/**
 * Cadence picker — chooses how often the BPS rebalance runs after
 * the fixed 24h-then-3d ramp-up. Three options: 3 / 5 / 7 days.
 *
 * Why fixed ramp-up: the first payout window (24h) gives early
 * gratification at launch; the second (3d) lets activity stabilize.
 * After that, projects with high contributor turnover want shorter
 * cadences and stable maintainer teams want longer ones — hence the
 * config knob.
 */
export function CadenceSelector({
  value,
  onChange,
  className,
}: CadenceSelectorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="space-y-1">
        <p className="text-label-md text-fg">
          Rebalance cadence (after launch)
        </p>
        <p className="text-body-sm text-fg-secondary">
          The first rebalance fires <span className="text-mono-sm">24h</span>{" "}
          after launch, the second{" "}
          <span className="text-mono-sm">3d</span> later. After that, this
          cadence sets the rhythm. Bags handles all claims directly — this
          only affects how often contributor weights update on-chain.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Steady-state rebalance cadence"
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {STEADY_STATE_CADENCE_OPTIONS.map((option) => {
          const isSelected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(option)}
              className={cn(
                "rounded-md border p-3 text-left transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-accent",
                isSelected
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-border-strong bg-surface text-fg-secondary hover:bg-surface-elevated",
              )}
            >
              <div className="text-label-md text-fg">
                {LABELS[option].primary}
              </div>
              <div className="text-body-sm text-fg-secondary">
                {LABELS[option].sub}
              </div>
              <div className="text-mono-sm mt-1 text-fg-secondary">
                {option}h
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
