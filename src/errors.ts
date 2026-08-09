export class AgentkeysError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(message: string, code = "failed", exitCode = 1) {
    super(message);
    this.name = "AgentkeysError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export class UsageError extends AgentkeysError {
  constructor(message: string) {
    super(message, "usage", 2);
    this.name = "UsageError";
  }
}
