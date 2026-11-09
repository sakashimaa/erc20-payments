import { Hono } from "hono";
import type { AppDeps } from "../app";
import { createMerchant, rotateMerchantSecrets } from "../controllers/merchant";
import { noStore } from "../middleware/cache";

export const merchantRoutes = (deps: AppDeps) =>
  new Hono()
    .use(noStore)
    .post("/:merchantId/rotate", ...rotateMerchantSecrets(deps))
    .post("/", ...createMerchant(deps));
