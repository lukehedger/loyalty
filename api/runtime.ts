import { createConfigReader } from '@loyalty/config';
import { type AccountRouter, createAccountRouter } from '@loyalty/router';
import { createTelemetry, type Telemetry } from '@loyalty/telemetry';

const readRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

// Called at import, so a warm container reuses the gate, the DynamoDB client and the config cache.
export const createRuntimeRouter = (): AccountRouter =>
  createAccountRouter({
    tableName: readRequiredEnv('TABLE_NAME'),
    config: createConfigReader({
      application: readRequiredEnv('APPCONFIG_APPLICATION'),
    }),
    clock: () => new Date(),
  });

export const createRuntimeTelemetry = (): Telemetry =>
  createTelemetry({ serviceName: 'loyalty', namespace: 'Loyalty' });
