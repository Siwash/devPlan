import React, { useEffect, useState } from 'react';
import { Card, List, Avatar, Tag, Button, Modal, Form, Input, InputNumber, Select, Space, message, Typography, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Developer } from '../../lib/types';
import { formatHours } from '../../lib/formatHours';

const { Title } = Typography;

const ROLES = ['前端', '后端', '测试', '设计', '产品', '架构', '运维', '全栈'];

export const DeveloperList: React.FC = () => {
  const { developers, loading, fetchDevelopers, createDeveloper, updateDeveloper, deleteDeveloper } = useDeveloperStore();
  const workHoursConfig = useSettingsStore((s) => s.workHoursConfig);
  const [formVisible, setFormVisible] = useState(false);
  const [editingDev, setEditingDev] = useState<Developer | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchDevelopers();
  }, []);

  const handleCreate = () => {
    setEditingDev(null);
    form.resetFields();
    form.setFieldsValue({ max_hours_per_day: 8 });
    setFormVisible(true);
  };

  const handleEdit = (dev: Developer) => {
    setEditingDev(dev);
    form.setFieldsValue(dev);
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingDev) {
        await updateDeveloper({ id: editingDev.id, ...values });
        message.success('成员已更新');
      } else {
        await createDeveloper(values);
        message.success('成员已创建');
      }
      setFormVisible(false);
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error('操作失败: ' + String(e));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDeveloper(id);
      message.success('成员已删除');
    } catch (e) {
      message.error('删除失败: ' + String(e));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>开发成员 ({developers.length})</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          添加成员
        </Button>
      </div>

      <List
        grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }}
        dataSource={developers}
        loading={loading}
        renderItem={(dev) => (
          <List.Item>
            <Card
              actions={[
                <EditOutlined key="edit" onClick={() => handleEdit(dev)} />,
                <Popconfirm key="del" title="确定删除此成员?" onConfirm={() => handleDelete(dev.id)}>
                  <DeleteOutlined />
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                avatar={
                  <Avatar
                    style={{ backgroundColor: dev.avatar_color }}
                    icon={<UserOutlined />}
                    size={48}
                  >
                    {dev.name[0]}
                  </Avatar>
                }
                title={
                  <Space>
                    {dev.name}
                    {!dev.is_active && <Tag color="red">停用</Tag>}
                  </Space>
                }
                description={
                  <div>
                    <div style={{ marginBottom: 4 }}>
                      {dev.roles.map(r => <Tag key={r} color="blue">{r}</Tag>)}
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      {dev.skills.map(s => <Tag key={s}>{s}</Tag>)}
                    </div>
                    <div style={{ color: '#999', fontSize: 12 }}>
                      每日最大工时: {formatHours(dev.max_hours_per_day, workHoursConfig)}
                    </div>
                  </div>
                }
              />
            </Card>
          </List.Item>
        )}
      />

      <Modal
        title={editingDev ? '编辑成员' : '添加成员'}
        open={formVisible}
        onOk={handleSubmit}
        onCancel={() => setFormVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="输入姓名" />
          </Form.Item>
          <Form.Item name="roles" label="角色">
            <Select mode="multiple" placeholder="选择角色" options={ROLES.map(r => ({ label: r, value: r }))} />
          </Form.Item>
          <Form.Item name="skills" label="技能标签">
            <Select mode="tags" placeholder="输入技能后按回车添加" tokenSeparators={[',', '，', ' ']} notFoundContent="输入后按回车添加" />
          </Form.Item>
          <Form.Item name="max_hours_per_day" label="每日最大工时">
            <InputNumber min={1} max={24} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="avatar_color" label="头像颜色">
            <Input type="color" style={{ width: 60, height: 32 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
