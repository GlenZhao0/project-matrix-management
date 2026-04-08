import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spin, Empty } from 'antd';
import ProjectDetail from '../components/pages/ProjectDetail';
import { getProject, getProjectParts, ProjectResponse, ProjectPart } from '../api/projects';

const ProjectDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [parts, setParts] = useState<ProjectPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjectData = async (projectId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [projectData, partData] = await Promise.all([
        getProject(projectId),
        getProjectParts(projectId),
      ]);
      setProject(projectData);
      setParts(partData);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取项目数据失败';
      setError(errorMsg);
      console.error('获取项目数据出错:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchProjectData(id);
  }, [id]);

  const handleBack = () => {
    navigate('/');
  };

  const handleRefresh = async () => {
    if (!id) return;
    await fetchProjectData(id);
  };

  if (loading) {
    return <Spin size="large" tip="加载中..." style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '500px' }} />;
  }

  if (error) {
    return (
      <Empty
        description={`加载失败: ${error}`}
        style={{ marginTop: '50px' }}
      />
    );
  }

  if (!project) {
    return (
      <Empty
        description="未找到项目"
        style={{ marginTop: '50px' }}
      />
    );
  }

  return (
    <ProjectDetail
      project={project}
      parts={parts}
      onBack={handleBack}
      onRefresh={handleRefresh}
    />
  );
};

export default ProjectDetailPage;