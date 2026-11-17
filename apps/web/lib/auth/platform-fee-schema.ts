import { z } from "zod";

export const PlatformFeeBpsSchema = z.number().int().min(0).max(10_000);
