export class BrokerError extends Error {
  constructor(
    public code: string,
    public http = 400,
  ) {
    super(code);
  }
}
export function requireThat(
  value: unknown,
  code: string,
  http = 403,
): asserts value {
  if (!value) throw new BrokerError(code, http);
}
export function safeCode(e: unknown) {
  return e instanceof BrokerError ? e.code : "internal_error";
}
