import { z } from 'zod';
import type { ConfigProfile } from './config.ts';

// A placeholder. Replace it with the application's first real profile.
export const featureFlagsProfile = {
  name: 'feature-flags',
  schema: z.strictObject({ exampleFlag: z.boolean() }),
} satisfies ConfigProfile<z.ZodType>;

// Every profile the stack deploys. Each needs a JSON file in every environments/ folder.
export const profiles = [featureFlagsProfile] as const;
