import type { DBSendInboxItem } from '@/types/sendRecords';

export interface InboxDrainerDeps {
  claimItem: () => Promise<DBSendInboxItem | null>;
  renewClaim: (id: string) => Promise<boolean>;
  completeItem: (id: string) => Promise<boolean>;
  failItem: (id: string, error: string) => Promise<boolean>;
  resolvePayload: (item: DBSendInboxItem) => Promise<File>;
  importItem: (file: File, item: DBSendInboxItem) => Promise<void>;
  deletePayload?: (item: DBSendInboxItem) => Promise<void>;
}

export interface DrainResult {
  processed: number;
  failed: number;
}

export const DEFAULT_MAX_ITEMS_PER_PASS = 5;

export async function drainInbox(): Promise<DrainResult> {
  return { processed: 0, failed: 0 };
}

export interface DrainResult {
  processed: number;
  failed: number;
}

/** How often to refresh a 15-minute lease during a long conversion/upload. */
export const LEASE_RENEW_INTERVAL_MS = 5 * 60 * 1000;

/** Max items drained per pass, so a large backlog never freezes a sync cycle. */
export const DEFAULT_MAX_ITEMS_PER_PASS = 5;

/**
 * Drain pending inbox items one at a time. Each item is claimed via the
 * lease RPC (so only one device processes it), kept alive with a heartbeat,
 * imported through the shared pipeline, then marked done — or failed, which
 * the RPC turns into a retry or a terminal failure after three attempts.
 *
 * importItem is expected to be idempotent (importBook dedups by hash), so a
 * retry after a partial failure never produces a duplicate book.
 */
export async function drainInbox(
  deps: InboxDrainerDeps,
  maxItems: number = DEFAULT_MAX_ITEMS_PER_PASS,
): Promise<DrainResult> {
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < maxItems; i++) {
    const item = await deps.claimItem();
    if (!item) break;

    const heartbeat = setInterval(() => {
      void deps.renewClaim(item.id);
    }, LEASE_RENEW_INTERVAL_MS);

    try {
      const file = await deps.resolvePayload(item);
      await deps.importItem(file, item);
      clearInterval(heartbeat);
      await deps.completeItem(item.id);
      if (deps.deletePayload) {
        // The book is already imported; a failed cleanup only leaves an
        // orphan R2 object, so never let it fail the item.
        try {
          await deps.deletePayload(item);
        } catch (err) {
          console.warn('Inbox payload cleanup failed:', err);
        }
      }
      processed++;
    } catch (err) {
      clearInterval(heartbeat);
      await deps.failItem(item.id, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  return { processed, failed };
}
