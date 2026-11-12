import z from "zod";

export const HttpErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z
      .array(z.object({ path: z.string().min(1), message: z.string().min(1) }))
      .optional(),
  }),
});
