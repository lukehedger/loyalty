// Structurally matches a Zod issue, so a failed parse passes its issues straight in without this leaf importing Zod's types.
export type ValidationIssue = {
  readonly path: readonly PropertyKey[];
  readonly message: string;
};

export class ValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super('Request failed validation');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class CapabilityNotSupportedError extends Error {
  readonly variant: string;
  readonly capability: string;

  constructor(variant: string, capability: string) {
    super(`${variant} does not support ${capability}`);
    this.name = 'CapabilityNotSupportedError';
    this.variant = variant;
    this.capability = capability;
  }
}

// The code is the core's rejection reason, such as the invariant the command would break.
export class DecisionRejectedError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DecisionRejectedError';
    this.code = code;
  }
}

export class IntegrationError extends Error {
  readonly integration: string;

  constructor(integration: string, options?: ErrorOptions) {
    super(`${integration} request failed`, options);
    this.name = 'IntegrationError';
    this.integration = integration;
  }
}
