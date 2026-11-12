import { zValidator } from "@hono/zod-validator";
import type z from "zod";

const validate = <T extends z.ZodType>(
  schema: T,
  type: "json" | "query" | "param",
) =>
  zValidator(type, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "validation_error",
            message: `invalid ${type}`,
            issues: result.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  });

export const validateJson = <T extends z.ZodType>(schema: T) =>
  validate(schema, "json");

export const validateQuery = <T extends z.ZodType>(schema: T) =>
  validate(schema, "query");

export const validateParams = <T extends z.ZodType>(schema: T) =>
  validate(schema, "param");
