import type { LogEntry } from './editor';

/**
 * The number of error entries after the entry the Log tab last showed
 * (T15.9). Entries are deduplicated by the editor, so the count is of
 * entries, not occurrences. A null last-seen id means nothing was seen yet.
 */
export function countNewErrors(entries: readonly LogEntry[], lastSeenId: number): number {
  return entries.filter((entry) => entry.level === 'error' && entry.id > lastSeenId).length;
}

/** The id of the newest entry the Log tab shows, 0 for an empty log. */
export function newestLogId(entries: readonly LogEntry[]): number {
  return entries.length === 0 ? 0 : entries[entries.length - 1]!.id;
}
