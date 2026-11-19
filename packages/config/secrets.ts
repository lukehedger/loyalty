import { getSecret } from '@aws-lambda-powertools/parameters/secrets';
import type { z } from 'zod';

export type FetchSecret = (
  name: string,
  options: { readonly maxAge: number; readonly forceFetch: boolean },
) => Promise<unknown>;

export type SecretReader = {
  readonly read: <Schema extends z.ZodType>(
    name: string,
    schema: Schema,
    options?: { readonly forceFetch?: boolean },
  ) => Promise<z.infer<Schema>>;
  readonly readString: (
    name: string,
    options?: { readonly forceFetch?: boolean },
  ) => Promise<string>;
};

export class SecretInvalidError extends Error {
  constructor(secretName: string) {
    super(`Secret "${secretName}" does not match its expected shape`);
    this.name = 'SecretInvalidError';
  }
}

const fetchFromSecretsManager: FetchSecret = (name, options) =>
  getSecret(name, options);

// JSON.parse and Zod errors can quote the input, so neither is kept as a cause.
const parseSecret = (name: string, secret: string): unknown => {
  try {
    return JSON.parse(secret);
  } catch {
    throw new SecretInvalidError(name);
  }
};

export const createSecretReader = ({
  maxAgeSeconds = 300,
  fetchSecret = fetchFromSecretsManager,
}: {
  readonly maxAgeSeconds?: number;
  readonly fetchSecret?: FetchSecret;
} = {}): SecretReader => {
  const readString = async (
    name: string,
    options?: { readonly forceFetch?: boolean },
  ): Promise<string> => {
    const secret = await fetchSecret(name, {
      maxAge: maxAgeSeconds,
      forceFetch: options?.forceFetch ?? false,
    });
    if (typeof secret !== 'string') throw new SecretInvalidError(name);

    return secret;
  };

  return {
    read: async (name, schema, options) => {
      const parsed = schema.safeParse(
        parseSecret(name, await readString(name, options)),
      );
      if (!parsed.success) throw new SecretInvalidError(name);

      return parsed.data;
    },
    readString,
  };
};
