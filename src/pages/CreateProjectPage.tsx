import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import CreateProject from '../components/pages/CreateProject';
import { createProject, CreateProjectInput, getProjectTemplates, ProjectTemplate } from '../api/projects';

const CreateProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const data = await getProjectTemplates();
        setTemplates(data);
      } catch (err) {
        console.error('加载项目模板失败:', err);
      }
    };

    fetchTemplates();
  }, []);

  const handleCreate = async (data: CreateProjectInput) => {
    try {
      setLoading(true);
      await createProject(data);
      message.success('项目创建成功！');
      navigate('/');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '创建项目失败';
      message.error(`创建失败: ${errorMsg}`);
      console.error('创建项目出错:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  return (
    <CreateProject
      onCreate={handleCreate}
      onCancel={handleCancel}
      loading={loading}
      templates={templates}
    />
  );
};

export default CreateProjectPage;
