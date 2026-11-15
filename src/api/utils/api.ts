import type { Context } from "hono";
import { UnauthorizedError } from "./http-error";

const BEARER = "Bearer ";

export const parseAuthToken = (c: Context) => {
  const header = c.req.header("Authorization");

  if (!header?.startsWith(BEARER)) throw new UnauthorizedError("invalid token");

  return header.slice(BEARER.length);
};
