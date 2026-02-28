import { create } from 'zustand';

interface TaskDetailState {
  open: boolean;
  taskId: number | null;
  openTaskDetail: (taskId: number) => void;
  closeTaskDetail: () => void;
}

export const useTaskDetailStore = create<TaskDetailState>((set) => ({
  open: false,
  taskId: null,
  openTaskDetail: (taskId: number) => set({ open: true, taskId }),
  closeTaskDetail: () => set({ open: false, taskId: null }),
}));
