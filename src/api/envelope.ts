// Every GSDS /search/* response uses the same envelope. We validate on that shape so
// detection survives URL/path changes, and so the interceptor can recognise a payload
// by its body rather than trusting the request URL.

export interface ParsedEnvelope<T> {
  ok: boolean;
  status: number;
  result: T | null;
  error: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

export function parseEnvelope<T>(raw: unknown): ParsedEnvelope<T> {
  if (!isObject(raw) || typeof raw.status !== 'number' || !('result' in raw)) {
    return { ok: false, status: 0, result: null, error: 'not a GSDS envelope' };
  }
  const status = raw.status;
  const errs = raw.errorMessages;
  const errText =
    Array.isArray(errs) && errs.length
      ? errs.join('; ')
      : typeof raw.message === 'string' && status !== 200
        ? raw.message
        : null;
  const ok = status === 200 && raw.result != null && !errText;
  return {
    ok,
    status,
    result: ok ? (raw.result as T) : null,
    error: ok ? null : (errText ?? `status ${status}`),
  };
}

/** Cheap fingerprint used by the interceptor to spot a GSDS payload without parsing it fully. */
export function looksLikeGsdsEnvelope(raw: unknown): boolean {
  return (
    isObject(raw) &&
    typeof raw.status === 'number' &&
    'result' in raw &&
    'errorMessages' in raw
  );
}
