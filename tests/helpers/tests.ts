import { expect } from "bun:test";
import postgres from "postgres";

const findPgError = (err: unknown) => {
  let cur: unknown = err;
  while (cur instanceof Error) {
    if (cur instanceof postgres.PostgresError) return cur;
    cur = cur.cause;
  }

  return undefined;
};

export const expectPgError = async (
  action: () => Promise<unknown>,
  pgErrCode: string,
  pgConstraintName?: string,
) => {
  try {
    await action();
  } catch (err) {
    const pgErr = findPgError(err);

    if (!pgErr) throw new Error("expected pg error", { cause: err });
    expect(pgErr.code).toBe(pgErrCode);
    if (pgConstraintName) expect(pgErr.constraint_name).toBe(pgConstraintName);

    return;
  }

  throw new Error(
    `expected pgErr ${pgErrCode} with constraint ${pgConstraintName}, but operation succeeded`,
  );
};
