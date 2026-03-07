import { create } from 'zustand';
import { standupApi } from '../lib/api';
import type {
  SaveStandupDocumentRequest,
  SaveStandupRequest,
  StandupDocument,
  StandupMeeting,
} from '../lib/types';

interface StandupState {
  currentDocument: StandupDocument | null;
  documents: StandupDocument[];
  currentMeeting: StandupMeeting | null;
  loading: boolean;
  error: string | null;
  fetchDocument: (date: string) => Promise<void>;
  saveDocument: (request: SaveStandupDocumentRequest) => Promise<number>;
  deleteDocument: (id: number) => Promise<void>;
  listDocuments: (startDate: string, endDate: string) => Promise<void>;
  fetchMeeting: (date: string) => Promise<void>;
  saveMeeting: (request: SaveStandupRequest) => Promise<number>;
  deleteMeeting: (id: number) => Promise<void>;
}

const toMeetingCompat = (document: StandupDocument | null): StandupMeeting | null => {
  if (!document) return null;
  return {
    ...document,
    meeting_date: document.date,
    notes: document.content,
    entries: [],
  };
};

const toMarkdownRequest = (request: SaveStandupRequest): SaveStandupDocumentRequest => {
  const effectiveDate = (request.date ?? request.meeting_date ?? '').trim();
  if (!effectiveDate) {
    throw new Error('saveMeeting requires a non-empty date (request.date or request.meeting_date).');
  }

  return {
    date: effectiveDate,
    content: request.content ?? request.notes ?? '',
  };
};

export const useStandupStore = create<StandupState>((set, get) => ({
  currentDocument: null,
  documents: [],
  currentMeeting: null,
  loading: false,
  error: null,

  fetchDocument: async (date: string) => {
    set({ loading: true, error: null });
    try {
      const document = await standupApi.getByDate(date);
      set({
        currentDocument: document,
        currentMeeting: toMeetingCompat(document),
        loading: false,
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  saveDocument: async (request: SaveStandupDocumentRequest) => {
    set({ loading: true, error: null });
    try {
      const id = await standupApi.save(request);
      await get().fetchDocument(request.date);
      return id;
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  deleteDocument: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await standupApi.delete(id);
      set((state) => ({
        currentDocument: state.currentDocument?.id === id ? null : state.currentDocument,
        currentMeeting: state.currentMeeting?.id === id ? null : state.currentMeeting,
        documents: state.documents.filter((document) => document.id !== id),
        loading: false,
      }));
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  listDocuments: async (startDate: string, endDate: string) => {
    set({ loading: true, error: null });
    try {
      const documents = await standupApi.list(startDate, endDate);
      set({ documents, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  fetchMeeting: async (date: string) => {
    await get().fetchDocument(date);
  },

  saveMeeting: async (request: SaveStandupRequest) => {
    const markdownRequest = toMarkdownRequest(request);
    return get().saveDocument(markdownRequest);
  },

  deleteMeeting: async (id: number) => {
    await get().deleteDocument(id);
  },
}));
