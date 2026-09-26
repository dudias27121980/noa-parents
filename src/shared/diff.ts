/**
 * The fields of `next` that differ from `base` (arrays/objects compared by value).
 * Editors send only these, so two stations editing different fields of the same record
 * don't overwrite each other.
 */
export const changedFields = <T extends object>(base: T, next: Partial<T>): Partial<T> => {
  const out: Partial<T> = {};
  (Object.keys(next) as (keyof T)[]).forEach((k) => {
    if (JSON.stringify(next[k]) !== JSON.stringify(base[k])) out[k] = next[k];
  });
  return out;
};
