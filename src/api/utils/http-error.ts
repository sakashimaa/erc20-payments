export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, options?: ErrorOptions) {
    super(404, message, "not_found", options);
  }
}
