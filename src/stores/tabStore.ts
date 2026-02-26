import { create } from 'zustand';

export interface TabItem {
  key: string;
  label: string;
  closable: boolean;
}

interface TabState {
  tabs: TabItem[];
  activeTab: string;
  openTab: (key: string, label: string, closable?: boolean) => void;
  closeTab: (key: string) => void;
  setActiveTab: (key: string) => void;
}

const DEFAULT_TAB: TabItem = { key: '/todo', label: '待办任务', closable: false };

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [DEFAULT_TAB],
  activeTab: '/todo',

  openTab: (key: string, label: string, closable: boolean = true) => {
    const { tabs } = get();
    const exists = tabs.find(t => t.key === key);
    if (!exists) {
      set({ tabs: [...tabs, { key, label, closable }], activeTab: key });
    } else {
      set({ activeTab: key });
    }
  },

  closeTab: (key: string) => {
    const { tabs, activeTab } = get();
    const target = tabs.find(t => t.key === key);
    if (!target || !target.closable) return;

    const newTabs = tabs.filter(t => t.key !== key);
    if (activeTab === key) {
      const idx = tabs.findIndex(t => t.key === key);
      const newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.key || '/todo';
      set({ tabs: newTabs, activeTab: newActive });
    } else {
      set({ tabs: newTabs });
    }
  },

  setActiveTab: (key: string) => {
    set({ activeTab: key });
  },
}));
