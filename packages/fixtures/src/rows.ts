export const patchById = <T extends { id: string }>(rows: T[], id: string, fn: (row: T) => T) =>
  rows.map((r) => (r.id === id ? fn(r) : r))

/** Replaces the row with the same id, or adds it. `prepend` puts new rows first (newest-first lists). */
export const upsert = <T extends { id: string }>(rows: T[], row: T, prepend = false) =>
  rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : prepend ? [row, ...rows] : [...rows, row]
