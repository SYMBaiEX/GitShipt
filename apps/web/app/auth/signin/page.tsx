import { Suspense } from "react";
import { SignInForm } from "./signin-form";

export const metadata = { title: "Sign in" };

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="grid min-h-screen place-items-center bg-bg px-6 py-12"
        >
          <p role="status" className="text-body-md text-fg-secondary">
            Loading sign in...
          </p>
        </main>
      }
    >
      <SignInContent searchParams={searchParams} />
    </Suspense>
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
