import type { ErrorHandler } from "hono";
import type { AppDeps } from "../app";
import { HTTPException } from "hono/http-exception";
import { HttpError } from "../utils/http-error";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { XpubValidationError } from "../../lib/xpub";
import {
  InvalidDerivationIndexError,
  InvalidMnemonicError,
} from "../../lib/hd";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErrorClass = new (...args: any[]) => Error;

const libErrorMap: Array<[ErrorClass, ContentfulStatusCode, string]> = [
  [XpubValidationError, 400, "xpub_invalid"],
  [InvalidDerivationIndexError, 400, "invalid_derivation_index"],
  [InvalidMnemonicError, 400, "invalid_mnemonic"],
];

const statusCodes: Partial<Record<number, string>> = {
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
};

export const createErrorHandler = (logger: AppDeps["logger"]): ErrorHandler => {
  return (err, c) => {
    if (err instanceof HTTPException)
      return c.json(
        {
          error: {
            code: statusCodes[err.status] || "http_error",
            message: err.message,
          },
        },
        err.status,
      );

    if (err instanceof HttpError)
      return c.json(
        {
          error: {
            code: err.code ?? "http_error",
            message: err.message,
            ...(err.issues ? { issues: err.issues } : {}),
          },
        },
        err.status as ContentfulStatusCode,
      );

    const mapped = libErrorMap.find(([cls]) => err instanceof cls);
    if (mapped) {
      const [, status, code] = mapped;

      return c.json(
        {
          error: {
            code,
            message: err.message,
          },
        },
        status,
      );
    }

    logger.error({ err }, "unhandled error");
    return c.json(
      { error: { code: "internal_error", message: "internal server error" } },
      500,
    );
  };
};
