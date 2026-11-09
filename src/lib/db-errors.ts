import postgres from "postgres";

export const findPgError = (err: unknown) => {
  let cur: unknown = err;
  while (cur instanceof Error) {
    if (cur instanceof postgres.PostgresError) return cur;
    cur = cur.cause;
  }

  return undefined;
};

export const isUniqueViolation = (err: unknown, constraint: string) => {
  const pg = findPgError(err);
  return pg?.code === "23505" && pg.constraint_name === constraint;
};
