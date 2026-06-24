'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useWebDAVSyncStore } from '@/store/webdavSyncStore';
import type { BookSource, BookSourceEntry, BookSourceDirectory } from '@/services/bookSources';
import { syncLibrary } from '@/services/webdav/WebDAVSync';
import { ingestFile } from '@/services/ingestService';
import { buildBookLookupIndex } from '@/services/bookService';
import { navigateToReader } from '@/utils/nav';
import { getLocalBookFilename } from '@/utils/book';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

interface BookSourceShelfProps {
  source: BookSource;
  onBack: () => void;
}

const BookSourceShelf: React.FC<BookSourceShelfProps> = ({ source, onBack }) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService, envConfig } = useEnv();
  const settings = useSettingsStore((s) => s.settings);
  const library = useLibraryStore((s) => s.library);
  const setLibrary = useLibraryStore((s) => s.setLibrary);
  const { isSyncing, progressLabel, beginSync, updateProgress, endSync } = useWebDAVSyncStore();
  const [entries, setEntries] = useState<BookSourceEntry[]>([]);
  const [directories, setDirectories] = useState<BookSourceDirectory[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const loadEntries = useCallback(
    async (dirPath?: string) => {
      setLoading(true);
      try {
        const [bookEntries, dirs] = await Promise.all([
          source.listEntries(dirPath),
          source.listDirectories?.(dirPath) ?? Promise.resolve([]),
        ]);
        setEntries(bookEntries);
        setDirectories(dirs);

        if (dirPath) {
          const segments = dirPath.split('/').filter(Boolean);
          const crumbs = segments.map((seg, i) => ({
            name: seg,
            path: '/' + segments.slice(0, i + 1).join('/'),
          }));
          setBreadcrumb(crumbs);
        } else {
          setBreadcrumb([]);
        }
      } catch (err) {
        console.error('Failed to load entries:', err);
        setEntries([]);
        setDirectories([]);
      } finally {
        setLoading(false);
      }
    },
    [source],
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleOpenBook = useCallback(
    async (entry: BookSourceEntry) => {
      if (!appService || opening === entry.id) return;
      setOpening(entry.id);

      try {
        const data = await source.downloadBook(entry);
        const ext = entry.format.toLowerCase();
        const file = new File([data], `${entry.title}.${ext}`);
        const lookupIndex = buildBookLookupIndex(library);
        const book = await ingestFile(
          { file, books: library, lookupIndex },
          { appService, settings, isLoggedIn: false },
        );

        if (book) {
          setLibrary([...library, book]);
          navigateToReader(router, [book.hash]);
        }
      } catch (err) {
        console.error('Failed to open book:', err);
      } finally {
        setOpening(null);
      }
    },
    [appService, opening, source, library, settings, setLibrary, router],
  );

  const handleSyncToWebDAV = useCallback(async () => {
    if (isSyncing || !appService) return;

    const stored = settings.webdav;
    if (!stored?.enabled || !stored.serverUrl) return;

    const eligibleBooks = library.filter((b) => !b.deletedAt);
    if (eligibleBooks.length === 0) return;

    let deviceId = stored.deviceId;
    if (!deviceId) {
      deviceId = uuidv4();
      const { saveSysSettings } = await import('@/helpers/settings');
      saveSysSettings(envConfig, 'webdav', { ...stored, deviceId });
    }

    beginSync(_('Syncing {{n}} / {{total}}', { n: 0, total: eligibleBooks.length }));

    try {
      await syncLibrary(stored, eligibleBooks, {
        strategy: 'send',
        syncBooks: true,
        deviceId: deviceId as string,
        loadConfig: (book) => appService.loadBookConfig(book, settings),
        loadBookFile: async (book) => {
          const fp = book.filePath ?? getLocalBookFilename(book);
          const base = book.filePath ? 'None' : 'Books';
          if (!(await appService.exists(fp, base))) return null;
          const file = await appService.openFile(fp, base);
          const bytes = await file.arrayBuffer();
          return { bytes, size: bytes.byteLength };
        },
        onProgress: ({ index, total, action }) => {
          updateProgress(
            action === 'uploading'
              ? _('Uploading {{n}} / {{total}}', { n: index + 1, total })
              : _('Downloading {{n}} / {{total}}', { n: index + 1, total }),
          );
        },
      });

      endSync();
      loadEntries();
    } catch (err) {
      console.error('Sync failed:', err);
      endSync();
    }
  }, [
    isSyncing,
    appService,
    settings,
    library,
    envConfig,
    beginSync,
    updateProgress,
    endSync,
    _,
    loadEntries,
  ]);

  const navigateToDir = useCallback(
    (dirPath: string) => {
      loadEntries(dirPath);
    },
    [loadEntries],
  );

  const navigateToCrumb = useCallback(
    (path: string) => {
      loadEntries(path);
    },
    [loadEntries],
  );

  return (
    <div className='flex min-h-0 flex-grow flex-col'>
      <div className='flex items-center gap-2 px-4 py-2'>
        <button className='btn btn-ghost btn-sm' onClick={onBack}>
          ← {_('Back')}
        </button>
        <div className='text-sm breadcrumbs'>
          <ul>
            <li>
              <button onClick={() => loadEntries()} className='link link-hover'>
                {source.name}
              </button>
            </li>
            {breadcrumb.map((crumb) => (
              <li key={crumb.path}>
                <button onClick={() => navigateToCrumb(crumb.path)} className='link link-hover'>
                  {crumb.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className='flex-grow' />
        {source.type === 'webdav' && (
          <button
            className={`btn btn-sm ${isSyncing ? 'btn-disabled' : 'btn-primary'}`}
            onClick={handleSyncToWebDAV}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <span className='loading loading-spinner loading-xs'></span>
                {progressLabel || _('Syncing...')}
              </>
            ) : (
              <>☁️ {_('Sync to WebDAV')}</>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <div className='flex flex-grow items-center justify-center'>
          <span className='loading loading-spinner loading-lg'></span>
        </div>
      ) : (
        <div className='flex-grow overflow-y-auto px-4 pb-4'>
          {directories.length > 0 && (
            <div className='mb-4'>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
                {directories.map((dir) => (
                  <button
                    key={dir.path}
                    className='bg-base-200 hover:bg-base-300 flex items-center gap-2 rounded-lg p-3 text-left transition-colors'
                    onClick={() => navigateToDir(dir.path)}
                  >
                    <span className='text-2xl'>📁</span>
                    <span className='truncate text-sm font-medium'>{dir.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.length > 0 && (
            <div>
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className='bg-base-200 hover:bg-base-300 group cursor-pointer rounded-lg p-3 transition-colors'
                    onClick={() => handleOpenBook(entry)}
                  >
                    <div className='mb-2 flex h-32 items-center justify-center rounded bg-base-100'>
                      {opening === entry.id ? (
                        <span className='loading loading-spinner'></span>
                      ) : (
                        <span className='text-4xl opacity-30'>📖</span>
                      )}
                    </div>
                    <div className='truncate text-sm font-medium' title={entry.title}>
                      {entry.title}
                    </div>
                    <div className='text-base-content/60 mt-1 flex items-center justify-between text-xs'>
                      <span>{entry.format}</span>
                      {entry.size && <span>{(entry.size / 1024 / 1024).toFixed(1)}MB</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entries.length === 0 && directories.length === 0 && (
            <div className='flex flex-grow items-center justify-center py-20'>
              <p className='text-base-content/60'>{_('No books found')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BookSourceShelf;
