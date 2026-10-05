import type { ZodError } from "zod";

/** An error safe to show to callers. Anything else becomes a generic 500. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "invalid_input"): ApiError =>
  new ApiError(400, code, message);
export const unauthorized = (): ApiError => new ApiError(401, "unauthorized", "Sign in required");
export const notFound = (what = "Not found"): ApiError => new ApiError(404, "not_found", what);
export const conflict = (code: string, message: string): ApiError =>
  new ApiError(409, code, message);
export const tooManyRequests = (): ApiError =>
  new ApiError(429, "rate_limited", "Too many requests, try again shortly");

export function fromZod(error: ZodError): ApiError {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "";
  return badRequest(issue ? `${path ? `${path}: ` : ""}${issue.message}` : "Invalid input");
}

/** Errors raised by database RPCs (SQLSTATE in `code`). */
export class RpcError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}
