import React, { useState } from 'react';
import { Form, Select, Space } from 'antd';
import { CreateProjectInput, ProjectTemplate } from '../../api/projects';
import Input from '../common/Input';
import Button from '../common/Button';

interface CreateProjectProps {
  onCreate: (data: CreateProjectInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  templates?: ProjectTemplate[];
}

const CreateProject: React.FC<CreateProjectProps> = ({ onCreate, onCancel, loading = false, templates = [] }) => {
  const [customerName, setCustomerName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [annualRevenueEstimate, setAnnualRevenueEstimate] = useState('');
  const [engineerName, setEngineerName] = useState('');
  const [pmName, setPmName] = useState('');
  const [projectTemplateId, setProjectTemplateId] = useState('');
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
        internal_code: internalCode || undefined,
        annual_revenue_estimate: annualRevenueEstimate || undefined,
        engineer_name: engineerName || undefined,
        pm_name: pmName || undefined,
        project_template_id: projectTemplateId || undefined,
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
        <Form.Item label="内部代码" style={{ marginBottom: '16px' }}>
          <Input value={internalCode} onChange={setInternalCode} placeholder="输入内部代码" />
        </Form.Item>
        <Form.Item label="预计年营收" style={{ marginBottom: '16px' }}>
          <Input value={annualRevenueEstimate} onChange={setAnnualRevenueEstimate} placeholder="例如 1200 万 / 2.5M USD" />
        </Form.Item>
        <Form.Item label="负责工程师" style={{ marginBottom: '16px' }}>
          <Input value={engineerName} onChange={setEngineerName} placeholder="输入负责工程师" />
        </Form.Item>
        <Form.Item label="PM" style={{ marginBottom: '16px' }}>
          <Input value={pmName} onChange={setPmName} placeholder="输入 PM" />
        </Form.Item>
        <Form.Item label="模板选择" style={{ marginBottom: '24px' }}>
          <Select
            value={projectTemplateId}
            onChange={setProjectTemplateId}
            style={{ width: '100%' }}
            placeholder="请选择一个项目模板(可选)"
            allowClear
          >
            {templates && templates.length > 0 ? (
              templates.map((template) => (
                <Select.Option key={template.id} value={template.id}>
                  {template.template_name}
                </Select.Option>
              ))
            ) : (
              <Select.Option value="" disabled>
                无可用模板
              </Select.Option>
            )}
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
