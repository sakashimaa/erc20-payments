import { Hono } from "hono";
import type { AppDeps } from "../app";
import { createInvoice } from "../controllers/invoice";

export const invoiceRoutes = (deps: AppDeps) =>
  new Hono().post("/", ...createInvoice(deps));
