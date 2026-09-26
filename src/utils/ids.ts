/** Next free numeric id for a prefix, e.g. nextIdNumber(['INC-7241'], 7300) -> 7300; with 'INC-7400' -> 7401 */
export const nextIdNumber = (ids: string[], floor: number) =>
  ids.reduce((max, id) => {
    const n = Number(/(\d+)$/.exec(id)?.[1]);
    return Number.isFinite(n) && n >= max ? n + 1 : max;
  }, floor);
