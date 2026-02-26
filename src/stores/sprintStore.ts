import { create } from 'zustand';
import { sprintApi, projectApi } from '../lib/api';
import type { Sprint, Project, CreateSprintDto } from '../lib/types';

interface SprintState {
  sprints: Sprint[];
  projects: Project[];
  loading: boolean;
  error: string | null;

  fetchSprints: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  createSprint: (dto: CreateSprintDto) => Promise<number>;
  deleteSprint: (id: number) => Promise<void>;
  createProject: (dto: { name: string; code?: string; description?: string }) => Promise<number>;
}

export const useSprintStore = create<SprintState>((set, get) => ({
  sprints: [],
  projects: [],
  loading: false,
  error: null,

  fetchSprints: async () => {
    set({ loading: true });
    try {
      const sprints = await sprintApi.list();
      set({ sprints, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchProjects: async () => {
    try {
      const projects = await projectApi.list();
      set({ projects });
    } catch (_) {}
  },

  createSprint: async (dto) => {
    const id = await sprintApi.create(dto);
    await get().fetchSprints();
    return id;
  },

  deleteSprint: async (id) => {
    await sprintApi.delete(id);
    await get().fetchSprints();
  },

  createProject: async (dto) => {
    const id = await projectApi.create(dto);
    await get().fetchProjects();
    return id;
  },
}));
