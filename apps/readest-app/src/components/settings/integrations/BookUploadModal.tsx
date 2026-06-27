'use client';

import clsx from 'clsx';
import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnv } from '@/context/EnvContext';
import { useWebDAVTransferStore } from '@/store/webdavTransferStore';
import { eventDispatcher } from '@/utils/event';
import { FileSyncEngine } from '@/services/sync/file/engine';
import { createAppLocalStore } from '@/services/sync/file/appLocalStore';
import { createWebDAVProvider } from '@/services/sync/providers/webdav/WebDAVProvider';
import type { Book } from '@/types/book';

interface BookUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
}

const BookUploadModal: React.FC<BookUploadModalProps> = ({ isOpen, onClose, books }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const settings = useSettingsStore((s) => s.settings);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const eligible = books.filter((b) => !b.deletedAt);
  const uploadRecords = useWebDAVTransferStore((s) => s.records);
  const uploadedHashes = useMemo(
    () => new Set(uploadRecords.filter((r) => r.type === 'upload').map((r) => r.bookHash)),
    [uploadRecords],
  );

  const toggleSelect = useCallback(
    (hash: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(hash)) {
          next.delete(hash);
        } else {
          next.add(hash);
        }
        return next;
      });
    },
    [],
  );

  const toggleSelectAll = useCallback(() => {
    if (selected.size === eligible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map((b) => b.hash)));
    }
  }, [selected.size, eligible]);

  const handleUpload = useCallback(async () => {
    if (selected.size === 0 || !appService) return;
    const wd = settings.webdav;
    if (!wd?.enabled || !wd?.serverUrl) return;

    setUploading(true);
    const selectedBooks = eligible.filter((b) => selected.has(b.hash));
    setProgress({ current: 0, total: selectedBooks.length });

    const provider = createWebDAVProvider(wd);
    const store = createAppLocalStore({ appService, settings, envConfig });
    const engine = new FileSyncEngine(provider, store);

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < selectedBooks.length; i++) {
      const book = selectedBooks[i]!;
      setProgress({ current: i + 1, total: selectedBooks.length });
      try {
        await engine.pushBookFile(book);
        await engine.pushBookCover(book);
        useWebDAVTransferStore.getState().addRecord({
          bookHash: book.hash,
          bookTitle: book.title || book.hash.slice(0, 8),
          type: 'upload',
          timestamp: Date.now(),
        });
        ok++;
      } catch {
        fail++;
      }
    }

    setUploading(false);
    setProgress(null);
    onClose();
    eventDispatcher.dispatch('toast', {
      type: fail > 0 ? 'warning' : 'info',
      message:
        fail > 0
          ? _('Upload completed: {{ok}} ok, {{fail}} failed', { ok, fail })
          : _('{{count}} book(s) uploaded', { count: ok }),
    });
  }, [selected, appService, settings, envConfig, eligible, onClose, _]);

  if (!isOpen) return null;

  return (
    <dialog className={clsx('modal', isOpen && 'modal-open')}>
      <div className='modal-box flex max-h-[80vh] flex-col p-0'>
        <div className='flex items-center justify-between border-b border-base-300 px-5 py-3'>
          <h3 className='text-lg font-semibold'>{_('Upload Books to WebDAV')}</h3>
          <button
            type='button'
            onClick={onClose}
            disabled={uploading}
            className='btn btn-ghost btn-sm btn-square'
            aria-label={_('Close')}
          >
            ✕
          </button>
        </div>

        <div className='flex items-center gap-3 border-b border-base-300 px-5 py-2'>
          <label className='flex cursor-pointer items-center gap-2 text-sm'>
            <input
              type='checkbox'
              className='checkbox checkbox-sm'
              checked={selected.size === eligible.length && eligible.length > 0}
              onChange={toggleSelectAll}
              disabled={uploading}
            />
            {_('Select all')} ({eligible.length})
          </label>
          {progress && (
            <span className='text-sm text-base-content/60'>
              {progress.current} / {progress.total}
            </span>
          )}
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-2 py-1'>
          {eligible.length === 0 ? (
            <div className='p-6 text-center text-base-content/50'>{_('No books in library')}</div>
          ) : (
            eligible.map((book) => (
              <label
                key={book.hash}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
                  'hover:bg-base-200',
                  selected.has(book.hash) && 'bg-base-200',
                )}
              >
                <input
                  type='checkbox'
                  className='checkbox checkbox-sm'
                  checked={selected.has(book.hash)}
                  onChange={() => toggleSelect(book.hash)}
                  disabled={uploading}
                />
                <span className='min-w-0 truncate text-sm'>
                  {book.title || book.hash.slice(0, 8)}
                </span>
                {uploadedHashes.has(book.hash) && (
                  <span className='badge badge-ghost badge-sm text-xs'>✓</span>
                )}
              </label>
            ))
          )}
        </div>

        <div className='flex justify-end gap-2 border-t border-base-300 px-5 py-3'>
          <button
            type='button'
            onClick={onClose}
            disabled={uploading}
            className='btn btn-ghost btn-sm'
          >
            {_('Cancel')}
          </button>
          <button
            type='button'
            onClick={handleUpload}
            disabled={uploading || selected.size === 0}
            className='btn btn-primary btn-sm'
          >
            {uploading ? (
              <span className='loading loading-spinner loading-sm' />
            ) : (
              _('Upload ({{count}})', { count: selected.size })
            )}
          </button>
        </div>
      </div>
      <div className='modal-backdrop' onClick={uploading ? undefined : onClose} />
    </dialog>
  );
};

export default BookUploadModal;
