"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@repo/ui";
import { Input } from "@repo/ui";
import { FormField } from "@/components/shared/FormField";
import { FormError } from "@/components/shared/FormError";
import {
  ApiErrorResponseSchema,
  MfaEnrollResponseSchema,
  type MfaEnrollResponse,
} from "@repo/shared";

/**
 * Enrollment flow:
 *   1. POST /api/auth/mfa/enroll -> server creates secret, returns QR.
 *   2. User scans + enters their first code.
 *   3. POST /api/auth/mfa/verify -> server confirms + records freshness.
 *   4. Page reloads to show the enrolled state.
 */
export function EnrollMfa({
  mode = "enroll",
}: {
  mode?: "enroll" | "regenerate";
}) {
  const [data, setData] = React.useState<MfaEnrollResponse | null>(null);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      if (!res.ok) {
        const body = ApiErrorResponseSchema.safeParse(
          await res.json().catch(() => null),
        );
        throw new Error(
          (body.success ? body.data.error : null) ??
            `enroll failed: ${res.status}`,
        );
      }
      setData(MfaEnrollResponseSchema.parse(await res.json()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmFirstCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = ApiErrorResponseSchema.safeParse(
          await res.json().catch(() => null),
        );
        throw new Error(
          (body.success ? body.data.error : null) ??
            `verify failed: ${res.status}`,
        );
      }
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {error ? (
          <FormError message={error} onDismiss={() => setError(null)} />
        ) : null}
        <p className="text-body-sm text-fg-secondary">
          {mode === "regenerate"
            ? "If the first QR code is gone, generate a fresh authenticator secret and scan the new code."
            : "Click below to generate a fresh secret and a QR code you can scan with any authenticator app."}
        </p>
        <div>
          <Button
            type="button"
            variant="primary"
            onClick={startEnrollment}
            disabled={busy}
          >
            {busy
              ? "Generating..."
              : mode === "regenerate"
                ? "Generate new QR code"
                : "Set up authenticator"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex shrink-0 items-center justify-center rounded-md border border-border bg-surface-elevated p-3">
        <Image
          src={data.qrDataUrl}
          alt="MFA QR code"
          width={192}
          height={192}
          unoptimized
          className="rounded"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {error ? (
          <FormError message={error} onDismiss={() => setError(null)} />
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-label-sm uppercase text-fg-muted">
            Manual entry
          </span>
          <code className="text-mono-sm break-all text-fg">
            {data.secretBase32}
          </code>
        </div>
        <FormField
          label="Enter the 6-digit code from your app"
          htmlFor="enroll-mfa-token"
          required
        >
          <Input
            id="enroll-mfa-token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="text-mono-md"
          />
        </FormField>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={confirmFirstCode}
            disabled={busy || token.length !== 6}
          >
            {busy ? "Confirming..." : "Confirm code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setData(null);
              setToken("");
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
