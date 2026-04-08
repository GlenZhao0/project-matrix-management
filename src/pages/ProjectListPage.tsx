import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Empty } from 'antd';
import ProjectList from '../components/pages/ProjectList';
import { getProjects, ProjectResponse } from '../api/projects';

const ProjectListPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    padding: '24px',
    boxSizing: 'border-box',
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getProjects();
        setProjects(data);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取项目列表失败';
        setError(errorMsg);
        console.error('获取项目列表出错:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleCreateProject = () => {
    navigate('/projects/new');
  };

  const handleRefresh = () => {
    setProjects([]);
    setLoading(true);
    const fetchProjects = async () => {
      try {
        const data = await getProjects();
        setProjects(data);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取项目列表失败';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <Spin size="large" tip="加载中..." style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '500px' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <Empty
          description={`加载失败: ${error}`}
          style={{ marginTop: '50px' }}
        />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div style={pageStyle}>
        <h1>项目列表</h1>
        <Empty
          description="暂无项目"
          style={{ marginTop: '50px' }}
        />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <ProjectList
        projects={projects}
        onViewProject={handleViewProject}
        onCreateProject={handleCreateProject}
        onRefresh={handleRefresh}
      />
    </div>
  );
};

export default ProjectListPage;
