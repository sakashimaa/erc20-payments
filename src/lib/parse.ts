export const parseNumberSafe = (s: string): number | null => {
  const trimmed = s.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
