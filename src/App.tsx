import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { TaskList } from './components/tasks/TaskList';
import { CalendarView } from './components/calendar/CalendarView';
import { DeveloperList } from './components/developers/DeveloperList';
import { DeveloperSchedule } from './components/developers/DeveloperSchedule';
import { GanttView } from './components/gantt/GanttView';
import { ImportWizard } from './components/excel/ImportWizard';
import { TodoBoard } from './components/tasks/TodoBoard';
import { SettingsPage } from './components/settings/SettingsPage';
import { ChatPanel } from './components/chat/ChatPanel';
import { useTabStore } from './stores/tabStore';
import { useSettingsStore } from './stores/settingsStore';

const PAGE_MAP: Record<string, { component: React.ReactNode; label: string }> = {
  '/todo': { component: <TodoBoard />, label: '待办任务' },
  '/tasks': { component: <TaskList />, label: '任务列表' },
  '/calendar': { component: <CalendarView />, label: '日历视图' },
  '/developers': { component: <DeveloperList />, label: '开发成员' },
  '/schedule': { component: <DeveloperSchedule />, label: '个人日程' },
  '/gantt': { component: <GanttView />, label: '甘特图' },
  '/import': { component: <ImportWizard />, label: 'Excel 导入' },
  '/settings': { component: <SettingsPage />, label: '设置' },
  '/chat': { component: <ChatPanel mode="page" />, label: 'AI 对话' },
};

const App: React.FC = () => {
  const { tabs, activeTab, openTab, setActiveTab } = useTabStore();
  const fetchWorkHoursConfig = useSettingsStore((s) => s.fetchWorkHoursConfig);
  const location = useLocation();
  const navigate = useNavigate();

  // Load work hours config on app start
  useEffect(() => {
    fetchWorkHoursConfig();
  }, []);

  // Sync URL → tab on first load or URL change
  useEffect(() => {
    const path = location.pathname === '/' ? '/todo' : location.pathname;
    const page = PAGE_MAP[path];
    if (page) {
      const exists = tabs.find(t => t.key === path);
      if (!exists) {
        openTab(path, page.label, path !== '/todo');
      } else {
        setActiveTab(path);
      }
    }
  }, [location.pathname]);

  // Sync tab → URL
  useEffect(() => {
    if (activeTab && activeTab !== location.pathname) {
      navigate(activeTab);
    }
  }, [activeTab]);

  return (
    <AppLayout>
      {tabs.map(tab => (
        <div
          key={tab.key}
          style={{
            display: tab.key === activeTab ? 'block' : 'none',
            height: '100%',
          }}
        >
          {PAGE_MAP[tab.key]?.component}
        </div>
      ))}
    </AppLayout>
  );
};

export default App;
