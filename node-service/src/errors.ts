export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "invalid_transition"
  | "insufficient_stock"
  | "internal";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}
