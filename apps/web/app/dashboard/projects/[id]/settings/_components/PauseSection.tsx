"use client";

import { useState, useTransition } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { Input } from "@repo/ui";
import { Badge } from "@repo/ui";
import { FormField } from "@/components/shared/FormField";
import { FormError } from "@/components/shared/FormError";
import { pauseProject } from "../../actions";

export function PauseSection({
  projectId,
  status,
  pausedReason,
}: {
  projectId: string;
  status: "draft" | "launch_configured" | "live" | "paused" | "killed" | "simulated_live";
  pausedReason: string | null;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState(pausedReason ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPaused = status === "paused";
  const isKilled = status === "killed";

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await pauseProject({
          projectId,
          pause: !isPaused,
          reason: !isPaused ? reason || undefined : undefined,
          idempotencyKey: `pause-${projectId}-${Date.now()}`,
        });
        setConfirmOpen(false);
        toast.success(isPaused ? "Project resumed" : "Project paused");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Toggle failed";
        setError(message);
        toast.error(message);
      }
    });
  }

  if (isKilled) {
    return (
      <p className="text-body-sm text-fg-secondary">
        Project is killed and cannot be paused or resumed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-label-sm text-fg-secondary">Current status:</span>
        {status === "simulated_live" ? (
          <Badge variant="default" size="sm">Not Live</Badge>
        ) : isPaused ? (
          <Badge variant="warning" size="sm">Paused</Badge>
        ) : (
          <Badge variant="success" dot size="sm">Live</Badge>
        )}
      </div>

      {!confirmOpen ? (
        <Button
          type="button"
          variant={isPaused ? "primary" : "secondary"}
          onClick={() => setConfirmOpen(true)}
        >
          {isPaused ? (
            <>
              <Play className="size-4" /> Resume project
            </>
          ) : (
            <>
              <Pause className="size-4" /> Pause project
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border border-border-strong bg-surface-elevated px-4 py-3">
          {!isPaused ? (
            <FormField
              label="Reason (optional, shown on the public page)"
              htmlFor="pause-reason"
            >
              <Input
                id="pause-reason"
                type="text"
                value={reason}
                maxLength={280}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. migrating maintainer keys"
              />
            </FormField>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isPaused ? "primary" : "danger"}
              onClick={handleToggle}
              disabled={pending}
            >
              {pending
                ? "Working..."
                : isPaused
                ? "Confirm resume"
                : "Confirm pause"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirmOpen(false);
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <FormError message={error} onDismiss={() => setError(null)} />
          ) : null}
        </div>
      )}
    </div>
  );
}
