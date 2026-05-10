"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@repo/ui";
import { FormError, FormField } from "@/components/shared";
import { updateAccountSettings } from "../actions";
import type { AccountSettings } from "@/lib/queries/account";

const DASHBOARD_ROUTES = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/dashboard/projects", label: "My projects" },
  { value: "/dashboard/earnings", label: "Earnings" },
  { value: "/dashboard/wallets", label: "Wallets" },
] as const;

export function AccountPreferencesForm({
  settings,
}: {
  settings: AccountSettings;
}) {
  const router = useRouter();
  const [payoutEmails, setPayoutEmails] = React.useState(settings.payoutEmails);
  const [securityEmails, setSecurityEmails] = React.useState(
    settings.securityEmails,
  );
  const [productEmails, setProductEmails] = React.useState(
    settings.productEmails,
  );
  const [defaultDashboardRoute, setDefaultDashboardRoute] = React.useState(
    settings.defaultDashboardRoute,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateAccountSettings({
          payoutEmails,
          securityEmails,
          productEmails,
          compactMode: settings.compactMode,
          defaultDashboardRoute,
          idempotencyKey: `settings-${Date.now()}`,
        });
        setSaved(true);
        toast.success("Preferences saved");
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Settings save failed.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      {error ? (
        <FormError message={error} onDismiss={() => setError(null)} />
      ) : null}

      <FormField
        label="Default account page"
        htmlFor="default-dashboard-route"
        hint="Used by the sidebar account menu."
      >
        <Select
          value={defaultDashboardRoute}
          onValueChange={(value) =>
            setDefaultDashboardRoute(
              value as AccountSettings["defaultDashboardRoute"],
            )
          }
        >
          <SelectTrigger id="default-dashboard-route">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DASHBOARD_ROUTES.map((route) => (
              <SelectItem key={route.value} value={route.value}>
                {route.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        <ToggleRow
          label="Payout email"
          detail="Bags claim status, partner-fee notices, and payout workflow follow-up."
          checked={payoutEmails}
          onCheckedChange={setPayoutEmails}
        />
        <ToggleRow
          label="Security email"
          detail="MFA, wallet, API key, and sensitive account changes."
          checked={securityEmails}
          onCheckedChange={setSecurityEmails}
        />
        <ToggleRow
          label="Product email"
          detail="Launchpad updates, workflow changes, and GitShipt release notes."
          checked={productEmails}
          onCheckedChange={setProductEmails}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-caption text-fg-muted">
          {settings.updatedAt
            ? `Last saved ${settings.updatedAt.toLocaleString()}`
            : "Defaults active"}
        </span>
        <div className="flex items-center gap-3">
          {saved ? (
            <span className="text-body-sm text-success" role="status">
              Saved.
            </span>
          ) : null}
          <Button type="submit" variant="primary" disabled={pending}>
            <Save className="size-4" />
            {pending ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onCheckedChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-label-md text-fg">{label}</span>
        <span className="mt-1 block text-body-sm text-fg-secondary">
          {detail}
        </span>
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  );
}
