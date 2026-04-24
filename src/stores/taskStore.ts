import { create } from 'zustand';
import { taskApi } from '../lib/api';
import type { Task, TaskFilter, CreateTaskDto, UpdateTaskDto } from '../lib/types';

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  filter: TaskFilter;
  selectedTask: Task | null;
  taskCount: number;
  /** 任务列表行选中keys by AI.Coding */
  selectedRowKeys: React.Key[];

  setFilter: (filter: TaskFilter) => void;
  fetchTasks: (filter?: TaskFilter) => Promise<void>;
  fetchTaskCount: () => Promise<void>;
  selectTask: (task: Task | null) => void;
  /** 设置行选中keys by AI.Coding */
  setSelectedRowKeys: (keys: React.Key[]) => void;
  createTask: (dto: CreateTaskDto) => Promise<number>;
  updateTask: (dto: UpdateTaskDto) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  filter: {},
  selectedTask: null,
  taskCount: 0,
  selectedRowKeys: [],

  setFilter: (filter) => {
    set({ filter });
  },

  fetchTasks: async (filter?: TaskFilter) => {
    set({ loading: true, error: null });
    try {
      const f = filter ?? get().filter;
      const tasks = await taskApi.list(f);
      set({ tasks, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchTaskCount: async () => {
    try {
      const count = await taskApi.count();
      set({ taskCount: count });
    } catch (_) {}
  },

  selectTask: (task) => set({ selectedTask: task }),

  /** 设置行选中keys by AI.Coding */
  setSelectedRowKeys: (keys) => set({ selectedRowKeys: keys }),

  createTask: async (dto) => {
    const id = await taskApi.create(dto);
    await get().fetchTasks();
    await get().fetchTaskCount();
    return id;
  },

  updateTask: async (dto) => {
    await taskApi.update(dto);
    await get().fetchTasks();
  },

  deleteTask: async (id) => {
    await taskApi.delete(id);
    set({ selectedTask: null });
    await get().fetchTasks();
    await get().fetchTaskCount();
  },
}));
