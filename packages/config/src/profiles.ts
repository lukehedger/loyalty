import { z } from 'zod';
import type { ConfigProfile } from './config.ts';

// A placeholder. Replace it with the application's first real profile.
export const featureFlagsProfile = {
  name: 'feature-flags',
  schema: z.strictObject({ exampleFlag: z.boolean() }),
} satisfies ConfigProfile<z.ZodType>;

// The cap keeps every earn far inside Number.MAX_SAFE_INTEGER, so the earn rate cannot fail a core assertion.
export const MAX_EARN_RATE = 100;

// Points per pound. DOMAIN.md defines it as a whole number of one or more.
export const earnRateProfile = {
  name: 'earn-rate',
  schema: z.strictObject({ earnRate: z.int().min(1).max(MAX_EARN_RATE) }),
} satisfies ConfigProfile<z.ZodType>;

// Every profile the stack deploys. Each needs a JSON file in every environments/ folder.
export const profiles: readonly ConfigProfile<z.ZodType>[] = [
  featureFlagsProfile,
  earnRateProfile,
];
