import { Book, BookConfig, BookNote, BookDataRecord } from '@/types/book';

export type SyncType = 'books' | 'configs' | 'notes' | 'stats';
export type SyncOp = 'push' | 'pull' | 'both';

interface BookRecord extends BookDataRecord, Book {}
interface BookConfigRecord extends BookDataRecord, BookConfig {}
interface BookNoteRecord extends BookDataRecord, BookNote {}

export interface StatBookRecord {
  user_id?: string;
  book_hash: string;
  title: string;
  authors: string;
  updated_at?: string;
  updated_at_ms?: number;
  deleted_at?: string | null;
}

export interface StatPageRecord {
  user_id?: string;
  book_hash: string;
  page: number;
  start_time: number;
  duration: number;
  total_pages: number;
  ext?: unknown;
  updated_at?: string;
  updated_at_ms?: number;
  deleted_at?: string | null;
}

export interface SyncResult {
  books: BookRecord[] | null;
  notes: BookNoteRecord[] | null;
  configs: BookConfigRecord[] | null;
  statBooks?: StatBookRecord[] | null;
  statPages?: StatPageRecord[] | null;
}

export type SyncRecord = BookRecord & BookConfigRecord & BookNoteRecord;

export interface SyncData {
  books?: Partial<BookRecord>[];
  notes?: Partial<BookNoteRecord>[];
  configs?: Partial<BookConfigRecord>[];
  statBooks?: StatBookRecord[];
  statPages?: StatPageRecord[];
}

export class SyncClient {
  async pullChanges(): Promise<SyncResult> {
    return { books: null, notes: null, configs: null };
  }

  async pushChanges(): Promise<SyncResult> {
    return { books: null, notes: null, configs: null };
  }
}
