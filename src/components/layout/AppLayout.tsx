import React, { useState } from 'react';
import { Layout, Menu, theme } from 'antd';
import {
  CalendarOutlined,
  UnorderedListOutlined,
  TeamOutlined,
  ImportOutlined,
  BarChartOutlined,
  ScheduleOutlined,
  SettingOutlined,
  CheckSquareOutlined,
  RobotOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { TabBar } from './TabBar';
import { useTabStore } from '../../stores/tabStore';
import { TaskDetailDrawer } from '../tasks/TaskDetailDrawer';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/todo', icon: <CheckSquareOutlined />, label: '待办任务' },
  { key: '/tasks', icon: <UnorderedListOutlined />, label: '任务列表' },
  { key: '/calendar', icon: <CalendarOutlined />, label: '日历视图' },
  { key: '/developers', icon: <TeamOutlined />, label: '开发成员' },
  { key: '/schedule', icon: <ScheduleOutlined />, label: '个人日程' },
  { key: '/gantt', icon: <BarChartOutlined />, label: '甘特图' },
  { key: '/standup', icon: <CommentOutlined />, label: '早会记录' },
  { key: '/import', icon: <ImportOutlined />, label: 'Excel 导入' },
];

const MENU_LABEL_MAP: Record<string, string> = {
  '/todo': '待办任务',
  '/tasks': '任务列表',
  '/calendar': '日历视图',
  '/developers': '开发成员',
  '/schedule': '个人日程',
  '/gantt': '甘特图',
  '/standup': '早会记录',
  '/import': 'Excel 导入',
};

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const { openTab } = useTabStore();
  const isFullscreen = useTabStore((s) => s.isFullscreen);

  const handleMenuClick = (key: string) => {
    const label = MENU_LABEL_MAP[key] || key;
    openTab(key, label, key !== '/todo');
    navigate(key);
  };

  const handleSettingsClick = () => {
    openTab('/settings', '设置', true);
    navigate('/settings');
  };

  const handleChatClick = () => {
    openTab('/chat', 'AI 对话', true);
    navigate('/chat');
  };

  if (isFullscreen) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{
          padding: 24,
          background: token.colorBgContainer,
          overflow: 'auto',
          height: '100vh',
        }}>
          {children}
        </Content>
        <TaskDetailDrawer />
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: token.colorBgContainer }}
      >
        <div style={{
          height: 48,
          margin: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: collapsed ? 16 : 20,
          color: token.colorPrimary,
        }}>
          {collapsed ? 'DP' : 'DevPlan'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => handleMenuClick(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          padding: '0 24px',
          background: token.colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          height: 48,
          lineHeight: '48px',
        }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>
            开发项目管理
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <RobotOutlined
              style={{ fontSize: 18, cursor: 'pointer' }}
              onClick={handleChatClick}
              title="AI 对话"
            />
            <SettingOutlined
              style={{ fontSize: 18, cursor: 'pointer' }}
              onClick={handleSettingsClick}
            />
          </span>
        </Header>
        <TabBar />
        <Content style={{
          margin: 16,
          padding: 24,
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          overflow: 'auto',
          height: 'calc(100vh - 48px - 40px - 32px)',
        }}>
          {children}
        </Content>
      </Layout>
      <TaskDetailDrawer />
    </Layout>
  );
};
