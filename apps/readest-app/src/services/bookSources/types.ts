import type { BookFormat } from '@/types/book';

export interface BookSourceEntry {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  size?: number;
  path: string;
  lastModified?: number;
  hash?: string;
}

export interface BookSourceDirectory {
  name: string;
  path: string;
}

export interface BookSourceCapabilities {
  canRead: boolean;
  canWrite: boolean;
  canBrowse: boolean;
}

export interface BookSource {
  readonly id: string;
  readonly name: string;
  readonly type: 'local-folder' | 'webdav';
  readonly capabilities: BookSourceCapabilities;

  isAvailable(): Promise<boolean>;
  listEntries(dirPath?: string): Promise<BookSourceEntry[]>;
  listDirectories?(dirPath?: string): Promise<BookSourceDirectory[]>;
  downloadBook(entry: BookSourceEntry): Promise<File | ArrayBuffer>;
  uploadBook?(entry: BookSourceEntry, data: ArrayBuffer): Promise<void>;
}
