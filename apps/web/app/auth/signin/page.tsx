import { Suspense } from "react";
import { SignInForm } from "./signin-form";

export const metadata = { title: "Sign in" };

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="grid min-h-dvh place-items-center bg-bg px-4 py-8 sm:px-6 sm:py-12"
    >
      <Suspense
        fallback={
          <p role="status" className="text-body-md text-fg-secondary">
            Loading sign in...
          </p>
        }
      >
        <SignInContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SignInContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <SignInForm next={typeof next === "string" ? next : "/dashboard"} />;
}
