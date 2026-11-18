# @loyalty/config

Runtime config served by AWS AppConfig and secrets read from AWS Secrets Manager. Each config profile is a Zod schema, so a profile is typed at compile time, validated against its JSON Schema when AppConfig deploys it and parsed again when a Lambda reads it.

## Public API

- `earnRateProfile` - the `earn-rate` profile: `{ earnRate }`, a whole number from 1 to `MAX_EARN_RATE` (100).
- `featureFlagsProfile` - a placeholder profile.
- `profiles` - every profile the stack deploys. Each needs a JSON file in every `environments/` folder.
- `ConfigProfile<Schema>` - a profile name paired with the Zod schema its content must match.
- `createConfigReader({ application, maxAgeSeconds?, fetchProfile? })` - returns a `ConfigReader` whose `read(profile)` fetches the profile from the `default` environment of the AppConfig application and parses it. Results are cached for `maxAgeSeconds` (60 by default).
- `toDeployableProfile(profile, content)` - parses the profile's JSON file at synth time and returns `{ name, content, jsonSchema }` for the AppConfig construct, whose validator rejects any later content that does not match.
- `ConfigProfileInvalidError` - the profile content does not match its schema.
- `createSecretReader({ maxAgeSeconds?, fetchSecret? })` - returns a `SecretReader`. `read(name, schema, { forceFetch? })` parses a JSON secret against a schema. `readString(name, { forceFetch? })` returns a string secret as it is stored. Results are cached for `maxAgeSeconds` (300 by default). `forceFetch` bypasses the cache, for a credential that has rotated.
- `SecretInvalidError` - the secret is not the expected shape. It never carries the secret value.

`fetchProfile` and `fetchSecret` default to Powertools Parameters. Tests pass inline fakes instead.

## Example

```ts
import { createConfigReader, type ConfigProfile } from '@loyalty/config';
import { z } from 'zod';

export const featureFlagsProfile = {
  name: 'feature-flags',
  schema: z.object({ instantRefunds: z.boolean() }),
} satisfies ConfigProfile<z.ZodType>;

const application = process.env.APPCONFIG_APPLICATION;
if (application === undefined)
  throw new Error('APPCONFIG_APPLICATION is not set');

const config = createConfigReader({ application });

const { instantRefunds } = await config.read(featureFlagsProfile);
```

In the stack, read `environments/<env>/feature-flags.json` and pass `toDeployableProfile(featureFlagsProfile, content)` to the AppConfig construct.

## Production config

The files in `environments/production/` are live config. A merge to `main` deploys them and each deploy replaces the whole profile. Follow the Runtime configuration rules in `CLAUDE.md` before you change one.
