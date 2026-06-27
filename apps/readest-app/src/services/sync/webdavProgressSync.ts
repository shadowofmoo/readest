import type { Book, BookConfig } from '@/types/book';
import { putFile } from '@/services/sync/providers/webdav/client';
import type { WebDAVConfig } from '@/services/sync/providers/webdav/client';
import { buildProgressFilePath, normalizeRoot } from '@/services/sync/file/layout';
import { buildRemotePayload } from '@/services/sync/file/wire';
import type { WebDAVSettings } from '@/types/settings';

export interface SyncProgressResult {
  synced: number;
  failed: number;
  total: number;
}

export interface ProgressSyncOptions {
  settings: WebDAVSettings;
  books: Book[];
  getConfig: (hash: string) => BookConfig | null;
  deviceId: string;
  onProgress?: (current: number, total: number, bookTitle: string) => void;
}

export const syncReadingProgress = async ({
  settings,
  books,
  getConfig,
  deviceId,
  onProgress,
}: ProgressSyncOptions): Promise<SyncProgressResult> => {
  const rootPath = normalizeRoot(settings.rootPath);
  const config: WebDAVConfig = {
    serverUrl: settings.serverUrl,
    username: settings.username,
    password: settings.password,
  };

  const eligible = books.filter((b): b is Book => !b.deletedAt);
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < eligible.length; i++) {
    const book = eligible[i]!;
    const bookConfig = getConfig(book.hash);

    if (!bookConfig) continue;

    onProgress?.(i + 1, eligible.length, book.title || book.hash.slice(0, 8));

    try {
      const payload = buildRemotePayload(book, bookConfig, deviceId);
      const path = buildProgressFilePath(rootPath, book);
      await putFile(config, path, JSON.stringify(payload));
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed, total: eligible.length };
};
