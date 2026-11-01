import { Hono } from "hono";
import type { AppDeps } from "../app";
import { getHealth } from "../controllers/health";

export const healthRoutes = ({ db, logger }: AppDeps) =>
  new Hono().get("/health", getHealth({ db, logger }));
