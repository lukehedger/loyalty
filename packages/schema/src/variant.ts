import { z } from 'zod';

// The router registry is a Record over this union, so a variant added here without an adapter fails to compile.
export const variants = [] as const;

export const variantSchema = z.enum(variants);

export type Variant = z.infer<typeof variantSchema>;
