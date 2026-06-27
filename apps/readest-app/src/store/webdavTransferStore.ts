import { create } from 'zustand';

export interface WebDAVTransferRecord {
  id: string;
  bookHash: string;
  bookTitle: string;
  type: 'download' | 'upload';
  timestamp: number;
}

interface WebDAVTransferState {
  records: WebDAVTransferRecord[];
  addRecord: (record: Omit<WebDAVTransferRecord, 'id'>) => void;
  hasDownloaded: (hash: string) => boolean;
  hasUploaded: (hash: string) => boolean;
  clearRecords: () => void;
}

let nextId = 1;

export const useWebDAVTransferStore = create<WebDAVTransferState>((set, get) => ({
  records: [],
  addRecord: (record) => {
    const id = `wd-tx-${nextId++}-${Date.now()}`;
    set((s) => ({ records: [...s.records, { ...record, id }] }));
  },
  hasDownloaded: (hash) => get().records.some((r) => r.bookHash === hash && r.type === 'download'),
  hasUploaded: (hash) => get().records.some((r) => r.bookHash === hash && r.type === 'upload'),
  clearRecords: () => set({ records: [] }),
}));
