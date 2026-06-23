'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useLibraryStore } from '@/store/libraryStore';
import { LocalFolderSource, WebDAVSource } from '@/services/bookSources';
import type { BookSource, BookSourceEntry, BookSourceDirectory } from '@/services/bookSources';
import { ingestFile } from '@/services/ingestService';
import { buildBookLookupIndex } from '@/services/bookService';
import { isTauriAppPlatform } from '@/services/environment';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';

interface BookSourceBrowserProps {
  onClose: () => void;
  onBookImported?: () => void;
}

const BookSourceBrowser: React.FC<BookSourceBrowserProps> = ({ onClose, onBookImported }) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const settings = useSettingsStore((s) => s.settings);
  const library = useLibraryStore((s) => s.library);
  const [activeSource, setActiveSource] = useState<BookSource | null>(null);
  const [entries, setEntries] = useState<BookSourceEntry[]>([]);
  const [directories, setDirectories] = useState<BookSourceDirectory[]>([]);
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<BookSource[]>([]);

  useEffect(() => {
    if (!appService) return;
    const list: BookSource[] = [];

    if (isTauriAppPlatform()) {
      const localPaths = settings.externalLibraryFolders ?? [];
      if (localPaths.length > 0) {
        list.push(new LocalFolderSource('local', _('Local Library'), localPaths, appService));
      }
    }

    const webdav = settings.webdav;
    if (webdav?.enabled && webdav.serverUrl) {
      list.push(
        new WebDAVSource(
          'webdav',
          'WebDAV',
          {
            serverUrl: webdav.serverUrl,
            username: webdav.username ?? '',
            password: webdav.password ?? '',
          },
          webdav.rootPath ?? '/',
        ),
      );
    }

    setSources(list);
  }, [appService, settings.externalLibraryFolders, settings.webdav, _]);

  const loadEntries = useCallback(async (source: BookSource, dirPath?: string) => {
    setLoading(true);
    try {
      const [bookEntries, dirs] = await Promise.all([
        source.listEntries(dirPath),
        source.listDirectories?.(dirPath) ?? Promise.resolve([]),
      ]);
      setEntries(bookEntries);
      setDirectories(dirs);
      setCurrentPath(dirPath);
    } catch (err) {
      console.error('Failed to load entries:', err);
      setEntries([]);
      setDirectories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSource) loadEntries(activeSource);
  }, [activeSource, loadEntries]);

  const handleImport = useCallback(
    async (entry: BookSourceEntry) => {
      if (!appService || importing.has(entry.id)) return;
      setImporting((prev) => new Set(prev).add(entry.id));
      try {
        const data = await activeSource!.downloadBook(entry);
        const ext = entry.format.toLowerCase();
        const file = new File([data], `${entry.title}.${ext}`);
        const lookupIndex = buildBookLookupIndex(library);
        await ingestFile(
          { file, books: library, lookupIndex },
          { appService, settings, isLoggedIn: false },
        );
        onBookImported?.();
      } catch (err) {
        console.error('Failed to import:', err);
      } finally {
        setImporting((prev) => {
          const next = new Set(prev);
          next.delete(entry.id);
          return next;
        });
      }
    },
    [appService, activeSource, importing, library, settings, onBookImported],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !appService) return;
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !SUPPORTED_BOOK_EXTS.includes(ext)) continue;
        try {
          const lookupIndex = buildBookLookupIndex(library);
          await ingestFile(
            { file, books: library, lookupIndex },
            { appService, settings, isLoggedIn: false },
          );
          onBookImported?.();
        } catch (err) {
          console.error('Failed to import:', err);
        }
      }
      e.target.value = '';
    },
    [appService, library, settings, onBookImported],
  );

  const navigateToDir = useCallback(
    (dirPath: string) => {
      if (activeSource) loadEntries(activeSource, dirPath);
    },
    [activeSource, loadEntries],
  );

  const navigateUp = useCallback(() => {
    if (!currentPath || !activeSource) return;
    const parent = currentPath.replace(/[/\\][^/\\]+$/, '') || '/';
    loadEntries(activeSource, parent === '/' ? undefined : parent);
  }, [activeSource, currentPath, loadEntries]);

  if (!activeSource) {
    return (
      <div className='flex flex-col gap-3 p-4'>
        <h3 className='text-lg font-semibold'>{_('Book Sources')}</h3>

        {sources.map((source) => (
          <button
            key={source.id}
            className='btn btn-ghost justify-start gap-3'
            onClick={() => setActiveSource(source)}
          >
            <span className='text-xl'>{source.type === 'local-folder' ? '📁' : '☁️'}</span>
            <div className='text-left'>
              <div>{source.name}</div>
              <div className='text-xs text-base-content/60'>
                {source.type === 'local-folder' ? _('Local') : 'WebDAV'}
              </div>
            </div>
          </button>
        ))}

        <div className='divider my-1'></div>

        <label className='btn btn-outline justify-start gap-3 cursor-pointer'>
          <span className='text-xl'>📄</span>
          {_('Upload Book Files')}
          <input
            type='file'
            multiple
            accept={SUPPORTED_BOOK_EXTS.map((e) => `.${e}`).join(',')}
            className='hidden'
            onChange={handleFileUpload}
          />
        </label>

        {sources.length === 0 && (
          <p className='text-sm text-base-content/60 px-2'>
            {_('Configure WebDAV in Settings → Integrations to browse remote books.')}
          </p>
        )}

        <button className='btn btn-ghost mt-2' onClick={onClose}>
          {_('Close')}
        </button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2 p-4'>
      <div className='flex items-center gap-2'>
        <button className='btn btn-ghost btn-sm' onClick={() => setActiveSource(null)}>
          ←
        </button>
        <h3 className='text-lg font-semibold'>{activeSource.name}</h3>
        {currentPath && (
          <button className='btn btn-ghost btn-sm' onClick={navigateUp}>
            ↑
          </button>
        )}
      </div>

      {currentPath && (
        <div className='text-xs text-base-content/60 truncate px-1'>{currentPath}</div>
      )}

      {loading ? (
        <div className='flex justify-center p-8'>
          <span className='loading loading-spinner'></span>
        </div>
      ) : (
        <div className='flex flex-col gap-1 max-h-[60vh] overflow-y-auto'>
          {directories.map((dir) => (
            <button
              key={dir.path}
              className='btn btn-ghost btn-sm justify-start'
              onClick={() => navigateToDir(dir.path)}
            >
              📁 {dir.name}
            </button>
          ))}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className='flex items-center gap-2 rounded-lg p-2 hover:bg-base-200'
            >
              <div className='flex-1 min-w-0'>
                <div className='truncate text-sm font-medium'>{entry.title}</div>
                <div className='text-xs text-base-content/60'>
                  {entry.format}
                  {entry.size ? ` · ${(entry.size / 1024 / 1024).toFixed(1)}MB` : ''}
                </div>
              </div>
              <button
                className='btn btn-primary btn-sm'
                disabled={importing.has(entry.id)}
                onClick={() => handleImport(entry)}
              >
                {importing.has(entry.id) ? (
                  <span className='loading loading-spinner loading-xs'></span>
                ) : (
                  _('Import')
                )}
              </button>
            </div>
          ))}
          {entries.length === 0 && directories.length === 0 && (
            <div className='p-4 text-center text-base-content/60'>{_('No books found')}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default BookSourceBrowser;
