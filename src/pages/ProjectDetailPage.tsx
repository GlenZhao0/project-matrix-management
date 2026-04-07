import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spin, Empty } from 'antd';
import ProjectDetail from '../components/pages/ProjectDetail';
import { getProjectMatrix, MatrixData } from '../api/matrix';

const ProjectDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchMatrixData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getProjectMatrix(id);
        setMatrixData(data);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取矩阵数据失败';
        setError(errorMsg);
        console.error('获取矩阵数据出错:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMatrixData();
  }, [id]);

  const handleBack = () => {
    navigate('/');
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

  if (!matrixData) {
    return (
      <Empty
        description="暂无数据"
        style={{ marginTop: '50px' }}
      />
    );
  }

  return (
    <ProjectDetail
      projectId={id || ''}
      parts={matrixData.parts}
      documentTypes={matrixData.document_types}
      slots={matrixData.slots}
      onBack={handleBack}
    />
  );
};

export default ProjectDetailPage;