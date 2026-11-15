import { createFactory } from "hono/factory";
import type { AppDeps } from "../app";
import { requireApiKey } from "../middleware/merchant";

const factory = createFactory();

export const createInvoice = (deps: AppDeps) =>
  factory.createHandlers(requireApiKey(deps), async (c) => {
    return c.json({ success: true, merchantId: c.var.merchantId }, 200);
  });
