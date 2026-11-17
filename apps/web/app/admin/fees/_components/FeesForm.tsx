"use client";

import * as React from "react";
import { Button } from "@repo/ui";
import { DestructiveConfirmModal } from "@/components/admin/DestructiveConfirmModal";
import { updateFeesBps } from "@/app/admin/actions";

export function FeesForm({ currentBps }: { currentBps: number }) {
  const [input, setInput] = React.useState(String(currentBps));
  const bps = Number(input);
  const valid = /^\d+$/.test(input) && Number.isInteger(bps) && bps <= 9999;
  const [open, setOpen] = React.useState(false);
  const dirty = bps !== currentBps;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-label-sm text-fg-secondary">Current</span>
        <span className="text-mono-sm text-fg">
          {currentBps} bps · {(currentBps / 100).toFixed(2)}%
        </span>
      </div>
      <div className="space-y-2">
        <label className="flex items-center justify-between text-label-sm text-fg-secondary">
          <span>New value</span>
          <span className="text-mono-sm text-fg">
            {bps} bps · {(bps / 100).toFixed(2)}%
          </span>
        </label>
        <input
          type="number"
          min={0}
          max={9999}
          step={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-mono-md text-fg outline-none focus:border-primary"
        />
        <div className="text-caption text-fg-muted">0–9,999 bps.</div>
      </div>
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || !valid}
          onClick={() => setOpen(true)}
        >
          Save fee
        </Button>
      </div>

      <DestructiveConfirmModal
        open={open}
        onOpenChange={setOpen}
        title="Update platform fee"
        description={
          <>
            New fee will be <span className="text-mono-sm">{bps} bps</span> (
            <span className="text-mono-sm">{(bps / 100).toFixed(2)}%</span>).
            Applies to new launch configurations only. Existing launches keep
            their configured allocation.
          </>
        }
        targetName="platform.fees.bps"
        targetLabel="Type platform.fees.bps to confirm"
        confirmLabel="Save fee"
        action={async (p) => {
          return await updateFeesBps({ bps, ...p });
        }}
        successToast={`Platform fee updated to ${bps} bps`}
      />
    </div>
  );
}
