import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookSourceStore } from '@/store/bookSourceStore';
import { LocalFolderSource, WebDAVSource } from '@/services/bookSources';

export function useBookSources() {
  const { appService } = useEnv();
  const settings = useSettingsStore((s) => s.settings);
  const { registerSource, sources } = useBookSourceStore();

  useEffect(() => {
    if (!appService) return;

    const localPaths = settings.externalLibraryFolders ?? [];
    if (localPaths.length > 0) {
      registerSource(new LocalFolderSource('local', 'Local Library', localPaths, appService));
    }

    const webdav = settings.webdav;
    if (webdav?.enabled && webdav.serverUrl) {
      registerSource(
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
  }, [appService, settings.externalLibraryFolders, settings.webdav, registerSource]);

  return { sources };
}
