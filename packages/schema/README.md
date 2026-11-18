# @loyalty/schema

Zod schemas for every request and response shape. Each schema gives the compile-time type through `z.infer`, the runtime validation and the OpenAPI spec. This package is a leaf: it imports no other workspace package.

## Public API

- `variants` - every supported variant. Add a member here when you add a variant.
- `variantSchema` - parses a value into a supported variant.
- `Variant` - the union of supported variants. The router registry is a `Record` over it, so a variant without an adapter fails to compile.
- `jsonBody(schema)` - wraps a schema so it parses a raw request body as JSON before it validates it. A missing or malformed body fails with a validation issue like any other.

## Example

```ts
import { jsonBody } from '@loyalty/schema';
import { z } from 'zod';

export const createOrderRequestSchema = jsonBody(
  z.object({ quantity: z.number().int().positive() }),
);

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

const result = createOrderRequestSchema.safeParse(event.body);
if (!result.success) throw new ValidationError(result.error.issues);
```
