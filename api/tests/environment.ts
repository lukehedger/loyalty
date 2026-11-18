// Handlers compose their runtime at import, which reads these. No test reaches AWS.
process.env.TABLE_NAME ??= 'test-state';
process.env.APPCONFIG_APPLICATION ??= 'test';
