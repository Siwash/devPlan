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
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/todo', icon: <CheckSquareOutlined />, label: '待办任务' },
  { key: '/tasks', icon: <UnorderedListOutlined />, label: '任务列表' },
  { key: '/calendar', icon: <CalendarOutlined />, label: '日历视图' },
  { key: '/developers', icon: <TeamOutlined />, label: '开发成员' },
  { key: '/schedule', icon: <ScheduleOutlined />, label: '个人日程' },
  { key: '/gantt', icon: <BarChartOutlined />, label: '甘特图' },
  { key: '/import', icon: <ImportOutlined />, label: 'Excel 导入' },
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

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
          onClick={({ key }) => navigate(key)}
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
        }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>
            开发项目管理
          </span>
          <SettingOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
        </Header>
        <Content style={{
          margin: 16,
          padding: 24,
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          overflow: 'auto',
          height: 'calc(100vh - 64px - 32px)',
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};
