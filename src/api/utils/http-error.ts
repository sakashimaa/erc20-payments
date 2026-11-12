export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly issues?: unknown[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, options?: ErrorOptions) {
    super(404, message, "not_found", undefined, options);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, issues?: unknown[], options?: ErrorOptions) {
    super(400, message, "validation_error", issues, options);
  }
}
