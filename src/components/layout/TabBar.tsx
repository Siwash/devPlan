import React from 'react';
import { Tabs, theme } from 'antd';
import { useTabStore } from '../../stores/tabStore';
import { useNavigate } from 'react-router-dom';

export const TabBar: React.FC<{ standupMode?: boolean }> = ({ standupMode = false }) => {
  const { tabs, activeTab, setActiveTab, closeTab } = useTabStore();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const items = tabs.map(tab => ({
    key: tab.key,
    label: tab.label,
    closable: tab.closable,
  }));

  return (
    <div
      className={`app-tabbar${standupMode ? ' is-standup' : ''}`}
      style={{
        background: standupMode ? 'transparent' : token.colorBgContainer,
        borderBottom: standupMode ? 'none' : `1px solid ${token.colorBorderSecondary}`,
        paddingLeft: standupMode ? 8 : 16,
        paddingRight: standupMode ? 8 : 0,
      }}
    >
      <Tabs
        type="editable-card"
        hideAdd
        activeKey={activeTab}
        items={items}
        size="small"
        onChange={(key) => {
          setActiveTab(key);
          navigate(key);
        }}
        onEdit={(targetKey, action) => {
          if (action === 'remove' && typeof targetKey === 'string') {
            const { tabs: currentTabs, activeTab: currentActive } = useTabStore.getState();
            const target = currentTabs.find(t => t.key === targetKey);
            if (!target?.closable) return;
            const newTabs = currentTabs.filter(t => t.key !== targetKey);
            if (currentActive === targetKey) {
              const idx = currentTabs.findIndex(t => t.key === targetKey);
              const newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.key || '/todo';
              useTabStore.setState({ tabs: newTabs, activeTab: newActive });
              navigate(newActive);
            } else {
              useTabStore.setState({ tabs: newTabs });
            }
          }
        }}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
};
