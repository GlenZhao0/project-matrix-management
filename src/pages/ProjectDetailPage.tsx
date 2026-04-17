import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Spin, Empty } from 'antd';
import ProjectDetail from '../components/pages/ProjectDetail';
import { getProject, getProjectParts, getProjects, ProjectResponse, ProjectPart } from '../api/projects';

const DEFAULT_PROJECT_LIST_NAME = '默认清单';

const normalizeProjectListName = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized || normalized === '项目清单') {
    return DEFAULT_PROJECT_LIST_NAME;
  }
  return normalized;
};

const ProjectDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [parts, setParts] = useState<ProjectPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjectData = async (projectId: string, options?: { preserveView?: boolean }) => {
    const preserveView = options?.preserveView ?? false;

    try {
      if (!preserveView) {
        setLoading(true);
      }
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
      if (!preserveView) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchProjectData(id);
  }, [id]);

  const handleBack = async () => {
    const targetListName = normalizeProjectListName(project?.project_list_name);

    try {
      const allProjects = await getProjects();
      const availableLists = Array.from(
        new Set(allProjects.map((item) => normalizeProjectListName(item.project_list_name)).filter(Boolean)),
      );

      if (availableLists.includes(targetListName)) {
        navigate(`/?projectListName=${encodeURIComponent(targetListName)}`);
        return;
      }

      if (availableLists[0]) {
        navigate(`/?projectListName=${encodeURIComponent(availableLists[0])}`);
        return;
      }
    } catch (err) {
      console.error('返回项目清单时获取清单列表失败:', err);
    }

    navigate('/');
  };

  const handleRefresh = async () => {
    if (!id) return;
    await fetchProjectData(id, { preserveView: true });
  };

  const requestedTab = searchParams.get('tab') === 'part-list' ? 'part-list' : 'summary';
  const startSummaryInEditMode = requestedTab === 'summary' && searchParams.get('mode') === 'edit';

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
      initialTab={requestedTab}
      startSummaryInEditMode={startSummaryInEditMode}
    />
  );
};

export default ProjectDetailPage;
