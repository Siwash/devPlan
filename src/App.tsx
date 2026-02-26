import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { TaskList } from './components/tasks/TaskList';
import { CalendarView } from './components/calendar/CalendarView';
import { DeveloperList } from './components/developers/DeveloperList';
import { DeveloperSchedule } from './components/developers/DeveloperSchedule';
import { GanttView } from './components/gantt/GanttView';
import { ImportWizard } from './components/excel/ImportWizard';
import { TodoBoard } from './components/tasks/TodoBoard';

const App: React.FC = () => {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/todo" replace />} />
        <Route path="/todo" element={<TodoBoard />} />
        <Route path="/tasks" element={<TaskList />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/developers" element={<DeveloperList />} />
        <Route path="/schedule" element={<DeveloperSchedule />} />
        <Route path="/gantt" element={<GanttView />} />
        <Route path="/import" element={<ImportWizard />} />
      </Routes>
    </AppLayout>
  );
};

export default App;
