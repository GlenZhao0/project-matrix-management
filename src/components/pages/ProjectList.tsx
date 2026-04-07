import React from 'react';
import { List, Card, Button as AntButton } from 'antd';
import { ProjectResponse } from '../../api/projects';
import Button from '../common/Button';

interface ProjectListProps {
  projects: ProjectResponse[];
  onViewProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRefresh?: () => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, onViewProject, onCreateProject }) => {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1>项目列表</h1>
        <Button onClick={onCreateProject}>新建项目</Button>
      </div>
      <List
        grid={{ gutter: 16, column: 4, xs: 1, sm: 2, md: 3, lg: 4 }}
        dataSource={projects}
        renderItem={(project) => (
          <List.Item>
            <Card
              title={project.project_name}
              style={{ minWidth: '280px' }}
              actions={[
                <AntButton key="view" onClick={() => onViewProject(project.id)}>查看详情</AntButton>
              ]}
            >
              <p>客户：{project.customer_name}</p>
              <p>模板：{project.template_name || '未指定'}</p>
              <p>根目录：{project.root_path || '未指定'}</p>
            </Card>
          </List.Item>
        )}
      />
    </div>
  );
};

export default ProjectList;