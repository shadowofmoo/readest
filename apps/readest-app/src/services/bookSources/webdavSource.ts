import type { BookFormat } from '@/types/book';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
import {
  listDirectory,
  getFileBinary,
  type WebDAVConfig,
} from '@/services/sync/providers/webdav/client';
import type {
  BookSource,
  BookSourceCapabilities,
  BookSourceDirectory,
  BookSourceEntry,
} from './types';

const extToFormat = (ext: string): BookFormat | null => {
  const map: Record<string, BookFormat> = {
    epub: 'EPUB',
    mobi: 'MOBI',
    azw: 'MOBI',
    azw3: 'MOBI',
    fb2: 'FB2',
    cbz: 'CBZ',
    pdf: 'PDF',
    txt: 'TXT',
  };
  return map[ext.toLowerCase()] ?? null;
};

export class WebDAVSource implements BookSource {
  readonly id: string;
  readonly name: string;
  readonly type = 'webdav' as const;
  readonly capabilities: BookSourceCapabilities = {
    canRead: true,
    canWrite: true,
    canBrowse: true,
  };

  private config: WebDAVConfig;
  private rootPath: string;

  constructor(id: string, name: string, config: WebDAVConfig, rootPath: string) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.rootPath = rootPath;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await listDirectory(this.config, this.rootPath);
      return true;
    } catch {
      return false;
    }
  }

  async listEntries(dirPath?: string): Promise<BookSourceEntry[]> {
    const targetPath = dirPath ?? this.rootPath;
    const allEntries = await listDirectory(this.config, targetPath);
    const entries: BookSourceEntry[] = [];

    for (const entry of allEntries) {
      if (entry.isDirectory) continue;
      const ext = entry.name.split('.').pop()?.toLowerCase();
      if (!ext || !SUPPORTED_BOOK_EXTS.includes(ext)) continue;
      const format = extToFormat(ext);
      if (!format) continue;

      const title = entry.name.replace(/\.[^.]+$/, '');
      entries.push({
        id: entry.path,
        title,
        format,
        size: entry.size,
        path: entry.path,
        lastModified: entry.lastModified ? new Date(entry.lastModified).getTime() : undefined,
      });
    }

    return entries;
  }

  async listDirectories(dirPath?: string): Promise<BookSourceDirectory[]> {
    const targetPath = dirPath ?? this.rootPath;
    const allEntries = await listDirectory(this.config, targetPath);

    return allEntries.filter((e) => e.isDirectory).map((e) => ({ name: e.name, path: e.path }));
  }

  async downloadBook(entry: BookSourceEntry): Promise<ArrayBuffer> {
    const data = await getFileBinary(this.config, entry.path);
    if (!data) throw new Error(`Failed to download: ${entry.path}`);
    return data;
  }

  async uploadBook(entry: BookSourceEntry, data: ArrayBuffer): Promise<void> {
    const { putFileBinary } = await import('@/services/sync/providers/webdav/client');
    await putFileBinary(this.config, entry.path, data);
  }
}
