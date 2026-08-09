import type { AgentkeysError } from "./errors.ts";

/**
 * Every domain outcome in a machine format, success or failure, is one
 * envelope on stdout — an agent always parses the last stdout, never empty
 * stdout plus stderr prose. Usage faults are the exception: they exit 2
 * before a command runs and are not envelopes.
 */
export interface Envelope<T> {
  schema_version: number;
  ok: boolean;
  error: { code: string; message: string } | null;
  data: T | null;
}

export const SCHEMA_VERSION = 1;

export function success<T>(data: T): Envelope<T> {
  return { schema_version: SCHEMA_VERSION, ok: true, error: null, data };
}

export function failure(error: AgentkeysError): Envelope<never> {
  return {
    schema_version: SCHEMA_VERSION,
    ok: false,
    error: { code: error.code, message: error.message },
    data: null,
  };
}
