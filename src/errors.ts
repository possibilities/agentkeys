export class AgentkeysError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "AgentkeysError";
    this.exitCode = exitCode;
  }
}

export class UsageError extends AgentkeysError {
  constructor(message: string) {
    super(message, 2);
    this.name = "UsageError";
  }
}
