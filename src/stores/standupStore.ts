import { create } from 'zustand';
import { standupApi } from '../lib/api';
import type { StandupMeeting, SaveStandupRequest } from '../lib/types';

interface StandupState {
  currentMeeting: StandupMeeting | null;
  loading: boolean;
  error: string | null;
  fetchMeeting: (date: string) => Promise<void>;
  saveMeeting: (request: SaveStandupRequest) => Promise<number>;
  deleteMeeting: (id: number) => Promise<void>;
}

export const useStandupStore = create<StandupState>((set, get) => ({
  currentMeeting: null,
  loading: false,
  error: null,

  fetchMeeting: async (date: string) => {
    set({ loading: true, error: null });
    try {
      const meeting = await standupApi.getByDate(date);
      set({ currentMeeting: meeting, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  saveMeeting: async (request: SaveStandupRequest) => {
    set({ loading: true, error: null });
    try {
      const id = await standupApi.save(request);
      // Refresh the meeting after save
      await get().fetchMeeting(request.meeting_date);
      return id;
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  deleteMeeting: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await standupApi.delete(id);
      set({ currentMeeting: null, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },
}));
