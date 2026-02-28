import { create } from 'zustand';
import { settingsApi } from '../lib/api';
import type { LlmConfig, ExcelTemplateConfig, WorkHoursConfig, OvertimeConfig } from '../lib/types';

interface SettingsState {
  llmConfig: LlmConfig | null;
  excelTemplateConfig: ExcelTemplateConfig | null;
  workHoursConfig: WorkHoursConfig;
  overtimeConfig: OvertimeConfig;
  loading: boolean;
  error: string | null;
  fetchLlmConfig: () => Promise<void>;
  saveLlmConfig: (config: LlmConfig) => Promise<void>;
  fetchExcelTemplateConfig: () => Promise<void>;
  saveExcelTemplateConfig: (config: ExcelTemplateConfig) => Promise<void>;
  fetchWorkHoursConfig: () => Promise<void>;
  saveWorkHoursConfig: (config: WorkHoursConfig) => Promise<void>;
  fetchOvertimeConfig: () => Promise<void>;
  saveOvertimeConfig: (config: OvertimeConfig) => Promise<void>;
}

const DEFAULT_WORK_HOURS: WorkHoursConfig = {
  display_unit: 'day',
  hours_per_day: 8,
};

const DEFAULT_OVERTIME: OvertimeConfig = {
  weekend: 'none',
  custom_dates: [],
};

export const useSettingsStore = create<SettingsState>((set) => ({
  llmConfig: null,
  excelTemplateConfig: null,
  workHoursConfig: DEFAULT_WORK_HOURS,
  overtimeConfig: DEFAULT_OVERTIME,
  loading: false,
  error: null,

  fetchLlmConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await settingsApi.getLlmConfig();
      set({ llmConfig: config, loading: false });
    } catch (e: any) {
      set({ error: e.toString(), loading: false });
    }
  },

  saveLlmConfig: async (config: LlmConfig) => {
    set({ loading: true, error: null });
    try {
      await settingsApi.saveLlmConfig(config);
      set({ llmConfig: config, loading: false });
    } catch (e: any) {
      set({ error: e.toString(), loading: false });
    }
  },

  fetchExcelTemplateConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await settingsApi.getExcelTemplateConfig();
      set({ excelTemplateConfig: config, loading: false });
    } catch (e: any) {
      set({ error: e.toString(), loading: false });
    }
  },

  saveExcelTemplateConfig: async (config: ExcelTemplateConfig) => {
    set({ loading: true, error: null });
    try {
      await settingsApi.saveExcelTemplateConfig(config);
      set({ excelTemplateConfig: config, loading: false });
    } catch (e: any) {
      set({ error: e.toString(), loading: false });
    }
  },

  fetchWorkHoursConfig: async () => {
    try {
      const unitStr = await settingsApi.getSetting('work_hours.display_unit');
      const hpdStr = await settingsApi.getSetting('work_hours.hours_per_day');
      set({
        workHoursConfig: {
          display_unit: (unitStr === 'hour' ? 'hour' : 'day') as 'day' | 'hour',
          hours_per_day: hpdStr ? parseFloat(hpdStr) : 8,
        },
      });
    } catch {
      // use defaults
    }
  },

  saveWorkHoursConfig: async (config: WorkHoursConfig) => {
    try {
      await settingsApi.saveSetting('work_hours.display_unit', config.display_unit, 'work_hours');
      await settingsApi.saveSetting('work_hours.hours_per_day', String(config.hours_per_day), 'work_hours');
      set({ workHoursConfig: config });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  fetchOvertimeConfig: async () => {
    try {
      const json = await settingsApi.getSetting('schedule.overtime_days');
      if (json) {
        const parsed = JSON.parse(json);
        set({
          overtimeConfig: {
            weekend: parsed.weekend || 'none',
            custom_dates: parsed.custom_dates || [],
          },
        });
      } else {
        set({ overtimeConfig: DEFAULT_OVERTIME });
      }
    } catch {
      set({ overtimeConfig: DEFAULT_OVERTIME });
    }
  },

  saveOvertimeConfig: async (config: OvertimeConfig) => {
    try {
      await settingsApi.saveSetting(
        'schedule.overtime_days',
        JSON.stringify(config),
        'schedule',
      );
      set({ overtimeConfig: config });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));
