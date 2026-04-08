import React, { useState } from 'react';
import { List } from 'antd';
import { ProjectResponse } from '../../api/projects';
import Button from '../common/Button';

interface ProjectListProps {
  projects: ProjectResponse[];
  onViewProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRefresh?: () => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, onViewProject, onCreateProject }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>项目列表</h1>
        <Button onClick={onCreateProject}>新建项目</Button>
      </div>
      <List
        bordered
        itemLayout="horizontal"
        dataSource={projects}
        renderItem={(project) => {
          const isHovered = hoveredId === project.id;
          return (
            <List.Item
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                transition: 'background-color 0.15s ease',
                backgroundColor: isHovered ? '#f5f7fa' : '#ffffff',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredId(project.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onViewProject(project.id)}
              key={project.id}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#1890ff',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      textDecoration: isHovered ? 'underline' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewProject(project.id);
                    }}
                  >
                    {project.project_name}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {new Date(project.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', color: '#4b5563', fontSize: '13px' }}>
                  <span>ID: {project.id.slice(0, 8)}</span>
                  <span>客户: {project.customer_name}</span>
                  <span>模板: {project.template_name || '未指定'}</span>
                </div>
              </div>
            </List.Item>
          );
        }}
      />
    </div>
  );
};

export default ProjectList;