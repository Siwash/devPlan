import { create } from 'zustand';
import { sprintApi, projectApi } from '../lib/api';
import type { Sprint, Project, CreateSprintDto, UpdateSprintDto } from '../lib/types';

interface SprintState {
  sprints: Sprint[];
  projects: Project[];
  loading: boolean;
  error: string | null;

  fetchSprints: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  createSprint: (dto: CreateSprintDto) => Promise<number>;
  /** 更新迭代信息 by AI.Coding */
  updateSprint: (dto: UpdateSprintDto) => Promise<Sprint>;
  deleteSprint: (id: number) => Promise<number>;
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

  /** 更新迭代 by AI.Coding */
  updateSprint: async (dto) => {
    const updated = await sprintApi.update(dto);
    await get().fetchSprints();
    return updated;
  },

  /** 删除迭代，返回解关联的任务数 by AI.Coding */
  deleteSprint: async (id) => {
    const result = await sprintApi.delete(id);
    await get().fetchSprints();
    return result.unlinked_tasks;
  },

  createProject: async (dto) => {
    const id = await projectApi.create(dto);
    await get().fetchProjects();
    return id;
  },
}));
