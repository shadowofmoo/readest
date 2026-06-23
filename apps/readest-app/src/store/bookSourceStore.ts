import { create } from 'zustand';
import type { BookSource } from '@/services/bookSources';

interface BookSourceState {
  sources: BookSource[];
  registerSource: (source: BookSource) => void;
  unregisterSource: (id: string) => void;
  getSource: (id: string) => BookSource | undefined;
  getSourcesByType: (type: BookSource['type']) => BookSource[];
}

export const useBookSourceStore = create<BookSourceState>((set, get) => ({
  sources: [],

  registerSource: (source) => {
    set((state) => {
      if (state.sources.some((s) => s.id === source.id)) return state;
      return { sources: [...state.sources, source] };
    });
  },

  unregisterSource: (id) => {
    set((state) => ({ sources: state.sources.filter((s) => s.id !== id) }));
  },

  getSource: (id) => get().sources.find((s) => s.id === id),

  getSourcesByType: (type) => get().sources.filter((s) => s.type === type),
}));
