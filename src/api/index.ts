import { env } from "../config/api-env";
import { db } from "../db";
import { logger } from "../lib/logger";
import { createApp } from "./app";

const app = createApp({ db, logger });

export default {
  port: env.HTTP_PORT,
  fetch: app.fetch,
};
