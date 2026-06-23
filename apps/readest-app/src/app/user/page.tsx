'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { IoArrowBack } from 'react-icons/io5';
import WindowButtons from '@/components/WindowButtons';
import { isTauriAppPlatform } from '@/services/environment';

const ProfilePage = () => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleGoBack = () => {
    router.push('/library');
  };

  if (!mounted) return null;

  return (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 select-none overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className={clsx('flex h-full w-full flex-col items-center overflow-y-auto')}
        style={{ paddingTop: `${safeAreaInsets?.top || 0}px` }}
      >
        <div className='flex w-full items-center justify-between px-4 py-2'>
          <button
            onClick={handleGoBack}
            className='btn btn-ghost h-8 min-h-8 w-8 p-0'
          >
            <IoArrowBack className='text-base-content' />
          </button>
          {isTauriAppPlatform() && appService?.hasWindowBar && (
            <WindowButtons showMinimize showMaximize showClose />
          )}
        </div>

        <div className='flex w-full max-w-md flex-col items-center gap-6 px-6 py-10'>
          <div className='avatar placeholder'>
            <div className='bg-base-300 text-base-content w-24 rounded-full'>
              <span className='text-3xl'>R</span>
            </div>
          </div>

          <div className='text-center'>
            <h1 className='text-xl font-bold'>{_('Local User')}</h1>
            <p className='text-base-content/60 mt-1 text-sm'>{_('Running in offline mode')}</p>
          </div>

          <div className='w-full rounded-lg bg-base-200 p-4'>
            <p className='text-base-content/80 text-sm'>
              {_('This is a local-only version. All data is stored on your device.')}
            </p>
          </div>

          <button onClick={handleGoBack} className='btn btn-primary w-full'>
            {_('Back to Library')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
