import type { Book } from '@/types/book';
import type { WebDAVSettings } from '@/types/settings';
import type { SyncLibraryResult, SyncLibraryOptions } from '@/services/sync/file/engine';

export const syncLibrary = async (
  _settings: WebDAVSettings,
  _books: Book[],
  _options: SyncLibraryOptions & {
    loadConfig?: (book: Book) => unknown;
    loadBookFile?: (book: Book) => Promise<{ bytes: ArrayBuffer; size: number } | null>;
    updateBookMetadata?: (book: Book) => Promise<void>;
    saveBookCover?: (book: Book, bytes: ArrayBuffer) => Promise<void>;
  },
): Promise<SyncLibraryResult> => {
  return {
    totalBooks: 0,
    configsUploaded: 0,
    configsDownloaded: 0,
    filesUploaded: 0,
    filesAlreadyInSync: 0,
    coversUploaded: 0,
    booksDownloaded: 0,
    metadataUpdated: 0,
    booksSynced: 0,
    failures: 0,
    failedBooks: [],
  };
};
