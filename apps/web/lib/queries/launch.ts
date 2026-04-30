import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import { hasCredentials, serverEnv } from "@/lib/env";
import { cacheTags } from "@/lib/cache";

export interface LaunchWizardConfig {
  isStubMode: boolean;
  initialBuyLamports: number;
}

async function getLaunchWizardConfigUncached(): Promise<LaunchWizardConfig> {
  try {
    return {
      isStubMode: !hasCredentials.bags(),
      initialBuyLamports: serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
    };
  } catch {
    return { isStubMode: true, initialBuyLamports: 0 };
  }
}

export async function getLaunchWizardConfig(): Promise<LaunchWizardConfig> {
  "use cache";
  cacheLife("browse");
  cacheTag(cacheTags.launch);
  return await getLaunchWizardConfigUncached();
}
