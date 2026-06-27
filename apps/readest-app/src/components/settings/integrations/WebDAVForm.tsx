import clsx from 'clsx';
import React, { useState } from 'react';
import { MdVisibility, MdVisibilityOff, MdSync, MdUpload } from 'react-icons/md';
import { v4 as uuidv4 } from 'uuid';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useWebDAVSyncStore } from '@/store/webdavSyncStore';
import { useWebDAVTransferStore } from '@/store/webdavTransferStore';
import { eventDispatcher } from '@/utils/event';
import {
  checkConnection,
  normalizeRootPath,
  WebDAVConnectResult,
} from '@/services/sync/providers/webdav/client';
import { type TranslationFunc } from '@/hooks/useTranslation';
import { buildWebDAVConnectSettings } from '@/services/sync/providers/webdav/connectSettings';
import { syncReadingProgress } from '@/services/sync/webdavProgressSync';
import SubPageHeader from '../SubPageHeader';
import { BoxedList, SectionTitle, SettingsRow } from '../primitives';
import WebDAVBrowsePane from './WebDAVBrowsePane';
import BookUploadModal from './BookUploadModal';

interface WebDAVFormProps {
  onBack: () => void;
}

/**
 * Translate a connection-probe failure into a user-facing string.
 *
 * Each branch must be a literal `_('...')` call so the i18next-scanner
 * picks the keys up — that's why this is a switch on `result.code`
 * rather than the previous `_(result.message || 'Connection error')`
 * pattern, which the scanner couldn't see into.
 */
const formatConnectError = (_: TranslationFunc, result: WebDAVConnectResult): string => {
  switch (result.code) {
    case 'SERVER_URL_REQUIRED':
      return _('Server URL is required');
    case 'AUTH_FAILED':
      return _('Authentication failed');
    case 'ROOT_NOT_FOUND':
      return _('Root directory not found');
    case 'UNEXPECTED_STATUS':
      return _('Unexpected server response (status {{status}})', {
        status: result.status ?? 0,
      });
    case 'NETWORK':
    default:
      return _('Network error');
  }
};

/**
 * WebDAV integration form. Two modes share the same panel:
 *
 * - Configuration: editable URL/username/password/root + Connect button.
 *   Lives in local state until Connect succeeds — only then do we
 *   persist the credentials via `saveSettings`. Failures surface via
 *   toast.
 *
 * - Connected: renders the per-page sync controls (sub-toggles, Sync
 *   now, sync-history) plus the {@link WebDAVBrowsePane} for the
 *   stored root, and a Disconnect button. The browse pane is its own
 *   component to keep this file legible — see its docstring.
 */
const WebDAVForm: React.FC<WebDAVFormProps> = ({ onBack }) => {
  const _ = useTranslation();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const { envConfig } = useEnv();

  const stored = settings.webdav;
  // Show the browse view only when an active connection is configured.
  // We rely on `enabled` (set by Connect, cleared by Disconnect) rather
  // than looking at serverUrl/username so Disconnect always returns the
  // user to the configuration form even if we keep their previous URL
  // pre-filled.
  const isConfigured = !!stored?.enabled && !!stored?.serverUrl;

  // Editable form state — initialised from saved settings so re-entering
  // the sub-page after a previous configure preserves what the user
  // typed.
  const [url, setUrl] = useState(stored?.serverUrl || '');
  const [username, setUsername] = useState(stored?.username || '');
  const [password, setPassword] = useState(stored?.password || '');
  const [rootPath, setRootPath] = useState(stored?.rootPath || '/');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showBookUpload, setShowBookUpload] = useState(false);
  // Library-wide Sync state — stored in a process-local zustand
  // store rather than component state so the run survives navigation
  // events that would otherwise unmount us (drilling back to the
  // Integrations list, closing the SettingsDialog and reopening it).
  // Without this hoist, the user would see the button re-enable, no
  // progress affordance, and could trigger a second concurrent
  // syncLibrary while the first was still in flight against the
  // server. See `webdavSyncStore.ts` for the design rationale.
  const isSyncing = useWebDAVSyncStore((s) => s.isSyncing);
  const beginSync = useWebDAVSyncStore((s) => s.beginSync);
  const updateProgress = useWebDAVSyncStore((s) => s.updateProgress);
  const endSync = useWebDAVSyncStore((s) => s.endSync);

  const handleConnect = async () => {
    if (!url || !username) return;
    setIsConnecting(true);
    const normalizedRoot = normalizeRootPath(rootPath);
    const result = await checkConnection({ serverUrl: url, username, password }, normalizedRoot);
    if (!result.success) {
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: `${_('Failed to connect')}: ${formatConnectError(_, result)}`,
      });
      setIsConnecting(false);
      return;
    }
    // Spread previous webdav state so a reconnect preserves bookkeeping
    // fields earned by prior use — deviceId, syncBooks, strategy,
    // syncProgress, syncNotes, lastSyncedAt. Rotating deviceId on
    // reconnect would make this device look new to the cross-device
    // clobber check in `RemoteBookConfig.writerDeviceId`.
    const newSettings = {
      ...settings,
      webdav: buildWebDAVConnectSettings(settings.webdav, {
        serverUrl: url,
        username,
        password,
        rootPath: normalizedRoot,
      }),
    };
    setSettings(newSettings);
    await saveSettings(envConfig, newSettings);
    setIsConnecting(false);
    eventDispatcher.dispatch('toast', { type: 'info', message: _('Connected') });
  };

  const handleDisconnect = async () => {
    const newSettings = {
      ...settings,
      webdav: {
        ...settings.webdav,
        enabled: false,
      },
    };
    setSettings(newSettings);
    await saveSettings(envConfig, newSettings);
    // Keep the password pre-filled (masked) so the user can reconnect
    // with a single click — they can still toggle visibility via the
    // eye icon.
    setShowPassword(false);
    eventDispatcher.dispatch('toast', { type: 'info', message: _('Disconnected') });
  };

  // —— Sync sub-toggles & manual triggers ——
  // The toggles persist via saveSettings synchronously (debouncing
  // isn't worth the extra state — users tap each toggle at most once
  // per session).
  //
  // IMPORTANT: read latest settings from the store (NOT the closure
  // variable) when computing `next`. Several persistWebdav calls can
  // land back-to-back — e.g. `handleSyncNow` writes `deviceId` up front
  // and `lastSyncedAt` when it finishes, and the user may flip a toggle
  // in between. The closure's `settings` was captured before those
  // writes, so a closure-based merge would rebuild the webdav object
  // from a stale snapshot and clobber a freshly-written field. Use
  // `useSettingsStore.getState()` so each call merges into whatever's
  // currently committed.
  const persistWebdav = async (patch: Partial<typeof stored>) => {
    const latest = useSettingsStore.getState().settings;
    const next = { ...latest, webdav: { ...latest.webdav, ...patch } };
    setSettings(next);
    await saveSettings(envConfig, next);
  };

  const handleSyncProgress = async () => {
    if (useWebDAVSyncStore.getState().isSyncing) return;
    if (!stored?.enabled || !stored.serverUrl) return;

    const appService = await envConfig.getAppService();
    if (!appService) return;

    const { libraryLoaded, library } = useLibraryStore.getState();
    let currentLibrary = library ?? [];
    if (!libraryLoaded && appService) {
      currentLibrary = await appService.loadLibraryBooks();
      useLibraryStore.getState().setLibrary(currentLibrary);
    }

    let deviceId = stored.deviceId;
    if (!deviceId) {
      deviceId = uuidv4();
      await persistWebdav({ deviceId });
    }

    beginSync(_('Syncing progress…'));
    try {
      const result = await syncReadingProgress({
        settings: stored,
        books: currentLibrary,
        getConfig: useBookDataStore.getState().getConfig,
        deviceId: deviceId as string,
        onProgress: (current, total) => {
          updateProgress(
            _('{{current}} / {{total}}', { current, total }),
          );
        },
      });

      await persistWebdav({ lastSyncedAt: Date.now() });
      if (result.synced === 0 && result.failed > 0) {
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: _('All failed — check WebDAV write permissions'),
        });
      } else if (result.failed > 0) {
        eventDispatcher.dispatch('toast', {
          type: 'warning',
          message: _('Progress sync: {{ok}} ok, {{fail}} failed', {
            ok: result.synced,
            fail: result.failed,
          }),
        });
      } else {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('Reading progress synced ({{count}} books)', { count: result.synced }),
        });
      }
    } catch (e) {
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Progress sync failed'),
      });
    } finally {
      endSync();
    }
  };

  const description: string = isConfigured
    ? _('Browsing {{path}} on {{server}}', {
        path: normalizeRootPath(stored.rootPath || '/'),
        server: stored.serverUrl,
      })
    : _('Connect to a WebDAV server to browse your remote files.');

  return (
    <div className='w-full'>
      <SubPageHeader
        parentLabel={_('Integrations')}
        currentLabel={_('WebDAV')}
        description={description}
        onBack={onBack}
      />

      {isConfigured ? (
        <div className='space-y-5'>
          <BoxedList>
            <SettingsRow
              label={_('Reading Progress')}
              description={_('Saved as progress-<name>.json under Readest/')}
            >
              <button
                type='button'
                onClick={handleSyncProgress}
                disabled={isSyncing}
                className={clsx(
                  'btn btn-ghost btn-sm h-8 min-h-8 gap-1 px-2',
                  isSyncing && 'opacity-60',
                )}
                title={_('Sync reading progress')}
                aria-label={_('Sync reading progress')}
              >
                {isSyncing ? (
                  <span className='loading loading-spinner loading-xs' />
                ) : (
                  <MdSync className='h-4 w-4' />
                )}
                {_('Sync Progress')}
              </button>
            </SettingsRow>
            <SettingsRow
              label={_('Books')}
              description={_('Upload selected books to WebDAV for cross-device access.')}
            >
              <button
                type='button'
                onClick={() => setShowBookUpload(true)}
                className='btn btn-ghost btn-sm h-8 min-h-8 gap-1 px-2'
                title={_('Upload books')}
                aria-label={_('Upload books')}
              >
                <MdUpload className='h-4 w-4' />
                {_('Upload Books')}
              </button>
            </SettingsRow>
          </BoxedList>

          <TransferHistory />

          <WebDAVBrowsePane settings={stored} onUpdateSettings={persistWebdav} />

          <div className='flex justify-end'>
            <button
              type='button'
              onClick={handleDisconnect}
              className={clsx(
                'eink-bordered',
                'h-10 rounded-lg px-4 text-sm font-medium',
                'text-error hover:bg-error/10',
                'transition-colors duration-150',
                'focus-visible:ring-error/40 focus-visible:outline-none focus-visible:ring-2',
              )}
            >
              {_('Disconnect')}
            </button>
          </div>
        </div>
      ) : (
        <div className='space-y-5'>
          <form
            className='space-y-4'
            onSubmit={(e) => {
              e.preventDefault();
              handleConnect();
            }}
          >
            <div className='space-y-1.5'>
              <SectionTitle as='label' htmlFor='webdav-server-url' className='block'>
                {_('Server URL')}
              </SectionTitle>
              <input
                id='webdav-server-url'
                type='text'
                placeholder='https://dav.example.com'
                className='input input-bordered eink-bordered h-11 w-full text-sm focus:outline-none'
                spellCheck='false'
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className='space-y-1.5'>
              <SectionTitle as='label' htmlFor='webdav-username' className='block'>
                {_('Username')}
              </SectionTitle>
              <input
                id='webdav-username'
                type='text'
                placeholder={_('Your Username')}
                className='input input-bordered eink-bordered h-11 w-full text-sm focus:outline-none'
                spellCheck='false'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete='username'
              />
            </div>

            <div className='space-y-1.5'>
              <SectionTitle as='label' htmlFor='webdav-password' className='block'>
                {_('Password')}
              </SectionTitle>
              <div className='relative'>
                <input
                  id='webdav-password'
                  type={showPassword ? 'text' : 'password'}
                  placeholder={_('Your Password')}
                  className='input input-bordered eink-bordered h-11 w-full pe-11 text-sm focus:outline-none'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete='current-password'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword((v) => !v)}
                  className={clsx(
                    'absolute end-2 top-1/2 -translate-y-1/2',
                    'flex h-8 w-8 items-center justify-center rounded',
                    'text-base-content/60 hover:text-base-content',
                    'hover:bg-base-200/60 transition-colors duration-150',
                    'focus-visible:ring-base-content/15 focus-visible:outline-none focus-visible:ring-2',
                  )}
                  aria-label={showPassword ? _('Hide password') : _('Show password')}
                  title={showPassword ? _('Hide password') : _('Show password')}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <MdVisibilityOff className='h-4 w-4' />
                  ) : (
                    <MdVisibility className='h-4 w-4' />
                  )}
                </button>
              </div>
            </div>

            <div className='space-y-1.5'>
              <SectionTitle as='label' htmlFor='webdav-root' className='block'>
                {_('Root Directory')}
              </SectionTitle>
              <input
                id='webdav-root'
                type='text'
                placeholder='/'
                className='input input-bordered eink-bordered h-11 w-full text-sm focus:outline-none'
                spellCheck='false'
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
              />
            </div>

            <div className='flex justify-end pt-1'>
              <button
                type='submit'
                disabled={isConnecting || !url || !username}
                className={clsx(
                  'btn btn-primary',
                  'h-10 min-h-10 rounded-lg border-0 px-5 text-sm font-medium',
                  'focus-visible:ring-primary/40 focus-visible:outline-none focus-visible:ring-2',
                  isConnecting && 'opacity-60',
                )}
              >
                {isConnecting ? (
                  <span className='loading loading-spinner loading-sm' />
                ) : (
                  _('Connect')
                )}
              </button>
            </div>
          </form>
        </div>
      )}
      <BookUploadModal
        isOpen={showBookUpload}
        onClose={() => setShowBookUpload(false)}
        books={useLibraryStore((s) => s.library) ?? []}
      />
    </div>
  );
};

export default WebDAVForm;

const TransferHistory: React.FC = () => {
  const _ = useTranslation();
  const records = useWebDAVTransferStore((s) => s.records);
  const clearRecords = useWebDAVTransferStore((s) => s.clearRecords);

  if (records.length === 0) {
    return (
      <BoxedList>
        <div className='px-1 py-2 text-sm text-base-content/50'>
          {_('No transfers yet — download or upload to see history')}
        </div>
      </BoxedList>
    );
  }

  const recent = [...records].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  return (
    <BoxedList>
      <div className='flex items-center justify-between px-1'>
        <span className='text-sm font-medium'>{_('Transfer History')}</span>
        <button
          type='button'
          onClick={clearRecords}
          className='btn btn-ghost btn-xs text-xs'
        >
          {_('Clear')}
        </button>
      </div>
      <div className='max-h-40 overflow-y-auto'>
        {recent.map((r) => (
          <div
            key={r.id}
            className='flex items-center gap-2 px-3 py-1.5 text-sm'
          >
            <span className={r.type === 'download' ? 'text-info' : 'text-success'}>
              {r.type === 'download' ? '↓' : '↑'}
            </span>
            <span className='min-w-0 truncate'>{r.bookTitle}</span>
            <span className='ml-auto shrink-0 text-xs text-base-content/50'>
              {new Date(r.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </BoxedList>
  );
};
