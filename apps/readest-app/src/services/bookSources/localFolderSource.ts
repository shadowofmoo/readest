import type { BookFormat } from '@/types/book';
import type { BaseDir } from '@/types/system';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
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

type AppServiceLike = {
  readDirectory: (path: string, base: BaseDir) => Promise<{ path: string; size: number }[]>;
};

export class LocalFolderSource implements BookSource {
  readonly id: string;
  readonly name: string;
  readonly type = 'local-folder' as const;
  readonly capabilities: BookSourceCapabilities = {
    canRead: true,
    canWrite: false,
    canBrowse: true,
  };

  private paths: string[];
  private appService: AppServiceLike;

  constructor(id: string, name: string, paths: string[], appService: AppServiceLike) {
    this.id = id;
    this.name = name;
    this.paths = paths;
    this.appService = appService;
  }

  async isAvailable(): Promise<boolean> {
    return this.paths.length > 0;
  }

  async listEntries(dirPath?: string): Promise<BookSourceEntry[]> {
    const targetPaths = dirPath ? [dirPath] : this.paths;
    const entries: BookSourceEntry[] = [];

    for (const basePath of targetPaths) {
      try {
        const files = await this.appService.readDirectory(basePath, 'None');
        for (const file of files) {
          const ext = file.path.split('.').pop()?.toLowerCase();
          if (!ext || !SUPPORTED_BOOK_EXTS.includes(ext)) continue;
          const format = extToFormat(ext);
          if (!format) continue;

          const name = file.path.split(/[/\\]/).pop() ?? file.path;
          const title = name.replace(/\.[^.]+$/, '');

          entries.push({
            id: file.path,
            title,
            format,
            size: file.size,
            path: file.path,
          });
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    return entries;
  }

  async listDirectories(dirPath?: string): Promise<BookSourceDirectory[]> {
    const targetPaths = dirPath ? [dirPath] : this.paths;
    const dirs: BookSourceDirectory[] = [];

    for (const basePath of targetPaths) {
      try {
        const files = await this.appService.readDirectory(basePath, 'None');
        const seen = new Set<string>();
        for (const file of files) {
          const dir = file.path.replace(/[/\\][^/\\]+$/, '');
          if (dir && dir !== basePath && !seen.has(dir)) {
            seen.add(dir);
            const name = dir.split(/[/\\]/).pop() ?? dir;
            dirs.push({ name, path: dir });
          }
        }
      } catch {
        // Skip
      }
    }

    return dirs;
  }

  async downloadBook(entry: BookSourceEntry): Promise<File | ArrayBuffer> {
    const response = await fetch(entry.path);
    return response.arrayBuffer();
  }
}
