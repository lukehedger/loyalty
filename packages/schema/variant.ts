import { z } from 'zod';

// The router registry is a Record over this union, so a variant added here without an adapter fails to compile.
// `direct` is a request made straight to Loyalty's own API, with no external system to translate.
export const variants = ['direct'] as const;

export const variantSchema = z.enum(variants);

export type Variant = z.infer<typeof variantSchema>;
