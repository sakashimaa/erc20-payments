import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { createErrorHandler } from "../../src/api/middleware/error";
import type { Logger } from "pino";
import { XpubValidationError } from "../../src/lib/xpub";
import {
  InvalidDerivationIndexError,
  InvalidMnemonicError,
} from "../../src/lib/hd";
import { NotFoundError, ValidationError } from "../../src/api/utils/http-error";
import { DecryptionError } from "../../src/lib/crypto";
import { HTTPException } from "hono/http-exception";
import { HttpErrorResponseSchema } from "../schemas/error";

const setup = (err: Error) => {
  const logger = { error: mock() };
  const app = new Hono();

  app.get("/boom", () => {
    throw err;
  });
  app.onError(createErrorHandler(logger as unknown as Logger));

  return { app, logger };
};

const hit = async (err: Error) => {
  const { app, logger } = setup(err);

  const res = await app.request("/boom");
  return { res, logger, body: await res.json() };
};

describe("error handler: unknown errors", () => {
  test.each([
    { name: "Error", err: new Error("connection refused 127.0.0.1") },
    { name: "DecryptionError", err: new DecryptionError("bad tag") },
  ])("$name -> 500 status without details + log", async ({ err }) => {
    const { res, body, logger } = await hit(err);

    expect(res.status).toBe(500);
    expect(body).toMatchObject({
      error: { code: "internal_error", message: "internal server error" },
    });
    expect(logger.error).toBeCalled();
  });
});

describe("error handler: known errors", () => {
  test("ValidationError gives issues", async () => {
    const issues = [{ path: "name", message: "required" }];
    const { res, body } = await hit(
      new ValidationError("invalid json", issues),
    );

    expect(res.status).toBe(400);
    expect(body).toMatchObject({
      error: { code: "validation_error", message: "invalid json", issues },
    });
  });

  test("HttpError without issues dont give them", async () => {
    const { body } = await hit(new NotFoundError("nope"));

    const parsed = HttpErrorResponseSchema.parse(body);
    expect(parsed.error).not.toHaveProperty("issues");
  });

  test("HTTPException preserve status", async () => {
    const { res } = await hit(new HTTPException(401, { message: "nope" }));
    expect(res.status).toBe(401);
  });

  test("subclass catches via instanceof", async () => {
    class XpubDepthError extends XpubValidationError {}
    const { res, body } = await hit(new XpubDepthError("deep", "wrong_depth"));

    const parsed = HttpErrorResponseSchema.parse(body);
    expect(res.status).toBe(400);
    expect(parsed.error.code).toBe("xpub_invalid");
  });

  test.each([
    {
      name: "XpubValidationError",
      err: new XpubValidationError("bad", "invalid_format"),
      status: 400,
      code: "xpub_invalid",
    },
    {
      name: "InvalidDerivationIndexError",
      err: new InvalidDerivationIndexError(),
      status: 400,
      code: "invalid_derivation_index",
    },
    {
      name: "InvalidMnemonicError",
      err: new InvalidMnemonicError(),
      status: 400,
      code: "invalid_mnemonic",
    },
    {
      name: "NotFoundError",
      err: new NotFoundError("мынезнакомы"),
      status: 404,
      code: "not_found",
    },
  ])("$name -> $status $code", async ({ err, status, code }) => {
    const { res, logger, body } = await hit(err);

    expect(res.status).toBe(status);
    expect(body).toMatchObject({
      error: { code, message: err.message },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
