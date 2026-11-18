import { App } from 'aws-cdk-lib';
import { AccountStack } from './account-stack.ts';
import { AppStack, type ConfigEnvironment } from './stack.ts';

const readRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined)
    throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const readConfigEnvironment = (): ConfigEnvironment => {
  const value = readRequiredEnv('CONFIG_ENVIRONMENT');
  if (value !== 'production' && value !== 'test')
    throw new Error(
      `CONFIG_ENVIRONMENT must be production or test, not ${value}`,
    );
  return value;
};

const readBoolean = (name: string): boolean => {
  const value = readRequiredEnv(name);
  if (value !== 'true' && value !== 'false')
    throw new Error(`${name} must be true or false, not ${value}`);
  return value === 'true';
};

const env = {
  account: readRequiredEnv('CDK_DEFAULT_ACCOUNT'),
  region: readRequiredEnv('CDK_DEFAULT_REGION'),
};

const app = new App();

new AccountStack(app, 'account', { env });

new AppStack(app, 'app', {
  configEnvironment: readConfigEnvironment(),
  deletionProtection: readBoolean('DELETION_PROTECTION'),
  env,
});
