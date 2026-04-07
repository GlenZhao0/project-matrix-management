import React, { useState } from 'react';
import { Form, Select, Space } from 'antd';
import { CreateProjectInput } from '../../api/projects';
import Input from '../common/Input';
import Button from '../common/Button';

interface CreateProjectProps {
  onCreate: (data: CreateProjectInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const CreateProject: React.FC<CreateProjectProps> = ({ onCreate, onCancel, loading = false }) => {
  const [customerName, setCustomerName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [template, setTemplate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!customerName.trim() || !projectName.trim()) {
      alert('请填写必填项');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        customer_name: customerName,
        project_name: projectName,
        template_name: template,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <h1>新建项目</h1>
      <Form layout="vertical" style={{ width: '100%' }}>
        <Form.Item label="客户名" style={{ marginBottom: '16px' }}>
          <Input value={customerName} onChange={setCustomerName} placeholder="输入客户名" />
        </Form.Item>
        <Form.Item label="项目名" style={{ marginBottom: '16px' }}>
          <Input value={projectName} onChange={setProjectName} placeholder="输入项目名" />
        </Form.Item>
        <Form.Item label="模板选择" style={{ marginBottom: '24px' }}>
          <Select value={template} onChange={setTemplate} style={{ width: '100%' }}>
            <Select.Option value="模板1">模板1</Select.Option>
            <Select.Option value="模板2">模板2</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button onClick={handleSubmit} loading={submitting || loading}>提交</Button>
            <Button onClick={onCancel} disabled={submitting || loading}>取消</Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
};

export default CreateProject;
