import { getAppConfig } from '@aws-lambda-powertools/parameters/appconfig';
import { z } from 'zod';

export type ConfigProfile<Schema extends z.ZodType> = {
  readonly name: string;
  readonly schema: Schema;
};

export type FetchProfile = (
  name: string,
  options: {
    readonly application: string;
    readonly environment: string;
    readonly maxAge: number;
  },
) => Promise<unknown>;

export type ConfigReader = {
  readonly read: <Schema extends z.ZodType>(
    profile: ConfigProfile<Schema>,
  ) => Promise<z.infer<Schema>>;
};

export type DeployableProfile = {
  readonly name: string;
  readonly content: string;
  readonly jsonSchema: z.core.JSONSchema.BaseSchema;
};

export class ConfigProfileInvalidError extends Error {
  constructor(profileName: string, options?: ErrorOptions) {
    super(`Config profile "${profileName}" does not match its schema`, options);
    this.name = 'ConfigProfileInvalidError';
  }
}

// The AppConfig construct deploys every profile to one environment with this name.
const APPCONFIG_ENVIRONMENT = 'default';

const fetchFromAppConfig: FetchProfile = (name, options) =>
  getAppConfig(name, { ...options, transform: 'json' });

export const createConfigReader = ({
  application,
  maxAgeSeconds = 60,
  fetchProfile = fetchFromAppConfig,
}: {
  readonly application: string;
  readonly maxAgeSeconds?: number;
  readonly fetchProfile?: FetchProfile;
}): ConfigReader => ({
  read: async (profile) => {
    const content = await fetchProfile(profile.name, {
      application,
      environment: APPCONFIG_ENVIRONMENT,
      maxAge: maxAgeSeconds,
    });
    const parsed = profile.schema.safeParse(content);
    if (!parsed.success) {
      throw new ConfigProfileInvalidError(profile.name, {
        cause: parsed.error,
      });
    }

    return parsed.data;
  },
});

// Parsing at synth fails the deploy before AppConfig sees an invalid profile.
export const toDeployableProfile = <Schema extends z.ZodType>(
  profile: ConfigProfile<Schema>,
  content: string,
): DeployableProfile => {
  const parsed = profile.schema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    throw new ConfigProfileInvalidError(profile.name, { cause: parsed.error });
  }

  return {
    name: profile.name,
    content,
    jsonSchema: z.toJSONSchema(profile.schema),
  };
};
