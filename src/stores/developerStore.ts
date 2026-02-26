import { create } from 'zustand';
import { developerApi } from '../lib/api';
import type { Developer, CreateDeveloperDto, UpdateDeveloperDto } from '../lib/types';

interface DeveloperState {
  developers: Developer[];
  loading: boolean;
  error: string | null;
  selectedDeveloper: Developer | null;
  selectedDeveloperId: number | null;

  fetchDevelopers: () => Promise<void>;
  selectDeveloper: (dev: Developer | null) => void;
  setSelectedDeveloperId: (id: number | null) => void;
  createDeveloper: (dto: CreateDeveloperDto) => Promise<number>;
  updateDeveloper: (dto: UpdateDeveloperDto) => Promise<void>;
  deleteDeveloper: (id: number) => Promise<void>;
}

export const useDeveloperStore = create<DeveloperState>((set, get) => ({
  developers: [],
  loading: false,
  error: null,
  selectedDeveloper: null,
  selectedDeveloperId: null,

  fetchDevelopers: async () => {
    set({ loading: true, error: null });
    try {
      const developers = await developerApi.list();
      set({ developers, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectDeveloper: (dev) => set({ selectedDeveloper: dev }),

  setSelectedDeveloperId: (id) => set({ selectedDeveloperId: id }),

  createDeveloper: async (dto) => {
    const id = await developerApi.create(dto);
    await get().fetchDevelopers();
    return id;
  },

  updateDeveloper: async (dto) => {
    await developerApi.update(dto);
    await get().fetchDevelopers();
  },

  deleteDeveloper: async (id) => {
    await developerApi.delete(id);
    set({ selectedDeveloper: null });
    await get().fetchDevelopers();
  },
}));
