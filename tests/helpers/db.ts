import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  apiKeys,
  chainCursors,
  invoices,
  merchants,
  transfers,
  webhookEvents,
} from "../../src/db/schema";

export const truncateAll = () =>
  db.execute(
    sql`TRUNCATE ${merchants}, ${apiKeys}, ${invoices}, ${transfers}, ${webhookEvents}, ${chainCursors} CASCADE`,
  );
