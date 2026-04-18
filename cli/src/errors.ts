export type ErrorCode =
  | "CONFIG_ERROR"
  | "BACKEND_ERROR"
  | "AUTH_REQUIRED"
  | "AUTH_REVOKED"
  | "AUTH_CALLBACK_TIMEOUT"
  | "AUTH_CODE_MISSING"
  | "OAUTH_STATE_MISMATCH"
  | "VALIDATION_ERROR"
  | "EBAY_API_ERROR";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly exitCode: number;

  public constructor(code: ErrorCode, message: string, details?: unknown, exitCode = 1) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}
