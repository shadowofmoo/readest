'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const AUTO_SYNC_INTERVAL = 5 * 60 * 1000;
const RETRY_DELAYS = [1000, 3000, 5000];
const PROPFIND_TIMEOUT = 15000;

interface BookSourceShelfProps {
  source: BookSource;
  onBack: () => void;
}

const formatIcons: Record<string, string> = {
  EPUB: '\uD83D\uDCD5',
  PDF: '\uD83D\uDCC4',
  MOBI: '\uD83D\uDCD8',
  FB2: '\uD83D\uDCD6',
  CBZ: '\uD83D\uDDBC',
  TXT: '\uD83D\uDCC3',
};

const retry = async <T,>(fn: () => Promise<T>, delays = RETRY_DELAYS): Promise<T> => {
  let lastErr: unknown;
  for (const delay of delays) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
};

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
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<Map<string, string>>(new Map());
  const autoSyncTimer = useRef<ReturnType<typeof setInterval>>();
  const timeoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const conflictDialog = useRef<{ resolve: (v: boolean) => void } | null>(null);
  const [conflictInfo, setConflictInfo] = useState<{
    bookTitle: string;
    localTime: number;
    remoteTime: number;
  } | null>(null);

  const isBookCached = useCallback((entry: BookSourceEntry) => {
    const index = buildBookLookupIndex(library);
    return index.byFilePath.has(entry.path);
  }, [library]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filteredEntries = searchDebounced
    ? entries.filter((e) =>
        e.title.toLowerCase().includes(searchDebounced.toLowerCase()) ||
        (e.author ?? '').toLowerCase().includes(searchDebounced.toLowerCase()))
    : entries;

  const doAutoSync = useCallback(async () => {
    if (autoSyncing || isSyncing || !appService) return;
    const stored = settings.webdav;
    if (!stored?.enabled || !stored.serverUrl) return;

    setAutoSyncing(true);
    try {
      const eligibleBooks = library.filter((b) => !b.deletedAt);
      let deviceId = stored.deviceId;
      if (!deviceId) {
        deviceId = uuidv4();
        const { saveSysSettings } = await import('@/helpers/settings');
        saveSysSettings(envConfig, 'webdav', { ...stored, deviceId });
      }

      await syncLibrary(stored, eligibleBooks, {
        strategy: 'silent',
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
      });

      setLastSyncTime(Date.now());
      loadEntries();
    } catch (err) {
      console.error('Auto-sync failed:', err);
    } finally {
      setAutoSyncing(false);
    }
  }, [autoSyncing, isSyncing, appService, settings, library, envConfig, loadEntries]);

  useEffect(() => {
    if (source.type === 'webdav') {
      doAutoSync();
      autoSyncTimer.current = setInterval(doAutoSync, AUTO_SYNC_INTERVAL);
    }
    return () => { clearInterval(autoSyncTimer.current); };
  }, [doAutoSync, source.type]);

  const loadEntries = useCallback(
    async (dirPath?: string) => {
      setLoading(true);
      setLoadingTimedOut(false);
      clearTimeout(timeoutTimer.current);
      timeoutTimer.current = setTimeout(() => setLoadingTimedOut(true), PROPFIND_TIMEOUT);

      try {
        const [bookEntries, dirs] = await Promise.all([
          retry(() => source.listEntries(dirPath)),
          source.listDirectories?.(dirPath) ?? Promise.resolve([]),
        ]);
        setEntries(bookEntries);
        setDirectories(dirs);
        setSelectMode(false);
        setSelected(new Set());
        setImportErrors(new Map());

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
        clearTimeout(timeoutTimer.current);
        setLoading(false);
        setLoadingTimedOut(false);
      }
    },
    [source],
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const resolveConflict = useCallback((useLocal: boolean) => {
    conflictDialog.current?.resolve(useLocal);
    conflictDialog.current = null;
    setConflictInfo(null);
  }, []);

  const handleOpenBook = useCallback(
    async (entry: BookSourceEntry) => {
      if (!appService || opening === entry.id) return;
      setOpening(entry.id);
      setImportErrors((prev) => { const n = new Map(prev); n.delete(entry.id); return n; });

      try {
        const data = await retry(() => source.downloadBook(entry));
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
        setImportErrors((prev) => { const n = new Map(prev); n.set(entry.id, String(err)); return n; });
      } finally {
        setOpening(null);
      }
    },
    [appService, opening, source, library, settings, setLibrary, router],
  );

  const handleBatchImport = useCallback(async () => {
    if (!appService || selected.size === 0) return;
    const selectedEntries = entries.filter((e) => selected.has(e.id));
    if (selectedEntries.length === 0) return;

    setImporting(new Set(selectedEntries.map((e) => e.id)));
    setImportErrors(new Map());

    for (const entry of selectedEntries) {
      try {
        const data = await retry(() => source.downloadBook(entry));
        const ext = entry.format.toLowerCase();
        const file = new File([data], `${entry.title}.${ext}`);
        const lookupIndex = buildBookLookupIndex(library);
        await ingestFile(
          { file, books: library, lookupIndex },
          { appService, settings, isLoggedIn: false },
        );
        setImporting((prev) => { const n = new Set(prev); n.delete(entry.id); return n; });
      } catch (err) {
        setImporting((prev) => { const n = new Set(prev); n.delete(entry.id); return n; });
        setImportErrors((prev) => { const n = new Map(prev); n.set(entry.id, String(err)); return n; });
      }
    }

    setSelected(new Set());
    setSelectMode(false);
    setLibrary([...library]);
    loadEntries();
  }, [appService, selected, entries, source, library, settings, setLibrary, loadEntries]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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
        strategy: 'silent',
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
  }, [isSyncing, appService, settings, library, envConfig, beginSync, updateProgress, endSync, _, loadEntries]);

  const navigateToDir = useCallback((dirPath: string) => { loadEntries(dirPath); }, [loadEntries]);
  const navigateToCrumb = useCallback((path: string) => { loadEntries(path); }, [loadEntries]);

  return (
    <div className='flex min-h-0 flex-grow flex-col'>
      <div className='flex items-center gap-2 px-4 py-2'>
        <button className='btn btn-ghost btn-sm' onClick={onBack}>← {_('Back')}</button>
        <div className='text-sm breadcrumbs'>
          <ul>
            <li><button onClick={() => loadEntries()} className='link link-hover'>{source.name}</button></li>
            {breadcrumb.map((crumb) => (
              <li key={crumb.path}>
                <button onClick={() => navigateToCrumb(crumb.path)} className='link link-hover'>{crumb.name}</button>
              </li>
            ))}
          </ul>
        </div>
        <div className='flex-grow' />
        {source.type === 'webdav' && lastSyncTime !== null && (
          <span className='text-xs text-base-content/50 whitespace-nowrap'>
            {autoSyncing && <span className='loading loading-spinner loading-xs mr-1'></span>}
            {_('Last synced: {{time}}', { time: new Date(lastSyncTime).toLocaleTimeString() })}
          </span>
        )}
        {source.type === 'webdav' && entries.length > 0 && (
          <button className='btn btn-ghost btn-sm' onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}>
            {selectMode ? _('Cancel') : _('Select')}
          </button>
        )}
        {source.type === 'webdav' && (
          <button className={`btn btn-sm ${isSyncing ? 'btn-disabled' : 'btn-primary'}`} onClick={handleSyncToWebDAV} disabled={isSyncing}>
            {isSyncing ? <><span className='loading loading-spinner loading-xs'></span>{progressLabel || _('Syncing...')}</> : <>☁️ {_('Sync')}</>}
          </button>
        )}
      </div>

      {selectMode && selected.size > 0 && (
        <div className='flex items-center gap-2 px-4 py-2 bg-primary/10'>
          <span className='text-sm font-medium'>{_('{{count}} selected', { count: selected.size })}</span>
          <button className='btn btn-primary btn-sm' onClick={handleBatchImport}>
            {_('Import Selected')}
          </button>
        </div>
      )}

      {entries.length > 0 && !loading && (
        <div className='px-4 py-2'>
          <input
            type='text'
            placeholder={_('Search by title or author...')}
            className='input input-bordered input-sm w-full'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className='flex flex-grow flex-col items-center justify-center gap-2'>
          <span className='loading loading-spinner loading-lg'></span>
          {loadingTimedOut && <p className='text-sm text-base-content/60'>{_('Taking longer than expected...')}</p>}
        </div>
      ) : (
        <div className='flex-grow overflow-y-auto px-4 pb-4'>
          {directories.length > 0 && (
            <div className='mb-4'>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
                {directories.map((dir) => (
                  <button key={dir.path} className='bg-base-200 hover:bg-base-300 flex items-center gap-2 rounded-lg p-3 text-left transition-colors' onClick={() => navigateToDir(dir.path)}>
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
                {filteredEntries.map((entry) => {
                  const cached = isBookCached(entry);
                  const isImporting = importing.has(entry.id);
                  const error = importErrors.get(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`relative cursor-pointer rounded-lg p-3 transition-colors ${selectMode
                        ? selected.has(entry.id) ? 'bg-primary/20 ring-2 ring-primary' : 'bg-base-200 hover:bg-base-300'
                        : 'bg-base-200 hover:bg-base-300 group'}`}
                      onClick={() => { if (selectMode) toggleSelect(entry.id); else handleOpenBook(entry); }}
                    >
                      {cached && <div className='absolute top-2 right-2 badge badge-success badge-xs'>✓</div>}
                      {error && <div className='absolute top-2 right-2 badge badge-error badge-xs'>!</div>}
                      <div className='mb-2 flex h-32 items-center justify-center rounded bg-base-100'>
                        {opening === entry.id || isImporting ? (
                          <span className='loading loading-spinner'></span>
                        ) : (
                          <span className='text-4xl opacity-50'>{formatIcons[entry.format] ?? '📖'}</span>
                        )}
                      </div>
                      <div className='truncate text-sm font-medium' title={entry.title}>{entry.title}</div>
                      <div className='text-base-content/60 mt-1 flex items-center justify-between text-xs'>
                        <span>{entry.format}</span>
                        <span>{cached ? _('Downloaded') : entry.size ? `${(entry.size / 1024 / 1024).toFixed(1)}MB` : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {entries.length === 0 && directories.length === 0 && !loading && (
            <div className='flex flex-grow items-center justify-center py-20'>
              <p className='text-base-content/60'>{_('No books found')}</p>
            </div>
          )}
        </div>
      )}

      {conflictInfo && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <div className='bg-base-100 rounded-box max-w-sm p-6 shadow-xl'>
            <h3 className='mb-2 text-lg font-semibold'>{_('Sync Conflict')}</h3>
            <p className='mb-4 text-sm text-base-content/70'>
              {_('Both local and remote have changed for: {{title}}', { title: conflictInfo.bookTitle })}
            </p>
            <div className='flex gap-2'>
              <button className='btn btn-primary btn-sm flex-1' onClick={() => resolveConflict(true)}>{_('Keep Local')}</button>
              <button className='btn btn-ghost btn-sm flex-1' onClick={() => resolveConflict(false)}>{_('Keep Remote')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookSourceShelf;
