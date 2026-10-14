export class BridgeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function classifyError(text) {
  if (/rate.?limit|quota.?exhaust|usage.?limit|insufficient_quota|usage_limit_reached|too many requests|\b429\b/i.test(text)) return 'quota';
  if (/model.*(not found|not available|not supported|does not exist|access|unavailable)|unsupported.*model|model_not_found/i.test(text)) return 'model';
  if (/not logged in|unauthorized|authentication|\b401\b/i.test(text)) return 'auth';
  return 'execution';
}
