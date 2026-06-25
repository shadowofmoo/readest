'use client';

import React, { useState, useEffect } from 'react';
import { debugLog } from '@/services/debugLog';
import { useTranslation } from '@/hooks/useTranslation';

interface DebugLogViewerProps {
  visible: boolean;
  onClose: () => void;
}

const DebugLogViewer: React.FC<DebugLogViewerProps> = ({ visible, onClose }) => {
  const _ = useTranslation();
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    debugLog.subscribe(fn);
    return () => debugLog.unsubscribe(fn);
  }, []);

  if (!visible) return null;

  const entries = debugLog.getAll().reverse();

  return (
    <div className='fixed inset-0 z-[100] flex flex-col bg-base-100'>
      <div className='flex items-center gap-2 border-b border-base-300 px-4 py-2'>
        <h3 className='text-lg font-semibold'>{_('Debug Log')}</h3>
        <span className='text-xs text-base-content/50'>({entries.length} entries)</span>
        <div className='flex-grow' />
        <button
          className='btn btn-ghost btn-sm'
          onClick={() => {
            const blob = new Blob([debugLog.exportText()], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `readest-debug-${new Date().toISOString().slice(0, 10)}.log`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          {_('Export')}
        </button>
        <button className='btn btn-ghost btn-sm' onClick={() => { debugLog.clear(); }}>{_('Clear')}</button>
        <button className='btn btn-ghost btn-sm' onClick={onClose}>✕</button>
      </div>
      <div className='flex-grow overflow-y-auto p-2 font-mono text-xs leading-relaxed'>
        {entries.map((entry, i) => (
          <div key={i} className={`py-0.5 border-b border-base-200 ${
            entry.level === 'error' ? 'text-red-500'
            : entry.level === 'warn' ? 'text-yellow-500'
            : 'text-base-content/80'
          }`}>
            <span className='text-base-content/40'>{entry.ts.slice(11, 19)}</span>{' '}
            <span className='font-semibold'>[{entry.tag}]</span>{' '}
            {entry.msg}
            {entry.detail && (
              <div className='ml-4 text-base-content/50 whitespace-pre-wrap'>{entry.detail.slice(0, 500)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DebugLogViewer;
