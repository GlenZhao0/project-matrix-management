import React from 'react';
import { Checkbox, Input, Table } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { ProjectResponse } from '../../api/projects';
import Button from '../common/Button';

interface ProjectListProps {
  projects: ProjectResponse[];
  title?: string;
  subtitle?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onViewProject: (projectId: string) => void;
  onCreateProject: () => void;
  onEditProject: (project: ProjectResponse) => void;
  onDeleteProject: (project: ProjectResponse) => void;
  onPreviewSummary: (project: ProjectResponse) => void;
  backupMode?: boolean;
  selectedProjectIds?: string[];
  onToggleSelectProject?: (projectId: string) => void;
  onToggleSelectAll?: (checked: boolean) => void;
}

const formatDateTime = (value?: string) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}-${day} ${hour}:${minute}`;
};

const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  title = 'Project List',
  subtitle = '管理项目基础信息与备份入口。',
  searchValue = '',
  onSearchChange,
  onViewProject,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  onPreviewSummary,
  backupMode = false,
  selectedProjectIds = [],
  onToggleSelectProject,
  onToggleSelectAll,
}) => {
  const allSelected = projects.length > 0 && selectedProjectIds.length === projects.length;

  const rowCellStyle: React.CSSProperties = {
    paddingTop: '10px',
    paddingBottom: '10px',
    verticalAlign: 'middle',
  };
  const centerHeaderCell = () => ({ style: { ...rowCellStyle, textAlign: 'center' as const } });

  const columns = [
    ...(backupMode
      ? [
          {
            title: (
              <Checkbox
                checked={allSelected}
                indeterminate={selectedProjectIds.length > 0 && !allSelected}
                onChange={(e) => onToggleSelectAll?.(e.target.checked)}
              >
                全选 / All
              </Checkbox>
            ),
            dataIndex: 'selection',
            key: 'selection',
            width: 72,
            align: 'center' as const,
            onCell: () => ({ style: rowCellStyle }),
            onHeaderCell: centerHeaderCell,
            render: (_: unknown, record: ProjectResponse) => (
              <Checkbox
                checked={selectedProjectIds.includes(record.id)}
                onChange={() => onToggleSelectProject?.(record.id)}
              />
            ),
          },
        ]
      : []),
          {
            title: '项目名称',
            dataIndex: 'project_name',
            key: 'project_name',
            width: 320,
            align: 'center' as const,
            onCell: () => ({ style: rowCellStyle }),
            onHeaderCell: centerHeaderCell,
            render: (_: unknown, record: ProjectResponse) => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minWidth: 0 }}>
                <Button
                  type="text"
                  size="small"
                  title="查看 Summary"
                  onClick={() => onPreviewSummary(record)}
                  style={{
                    width: '28px',
                    minWidth: '28px',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    flex: '0 0 auto',
                  }}
                >
                  <EyeOutlined />
                </Button>
                <button
                  type="button"
                  onClick={() => onViewProject(record.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    color: 'var(--primary-color)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {record.project_name}
                </button>
              </div>
            ),
          },
          {
          title: '客户',
          dataIndex: 'customer_name',
          key: 'customer_name',
          width: 140,
      align: 'center' as const,
          onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (value: string | undefined) => (
        <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>
      ),
    },
    {
      title: '内部代码',
      dataIndex: 'internal_code',
      key: 'internal_code',
      width: 140,
      align: 'center' as const,
      onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (value: string | undefined) => (
        <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>
      ),
    },
    {
      title: '预计年营收',
      dataIndex: 'annual_revenue_estimate',
      key: 'annual_revenue_estimate',
      width: 120,
      align: 'center' as const,
      onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (value: string | undefined) => (
        <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>
      ),
    },
    {
      title: '负责工程师',
      dataIndex: 'engineer_name',
      key: 'engineer_name',
      width: 130,
      align: 'center' as const,
      onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (value: string | undefined) => (
        <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>
      ),
    },
    {
      title: 'PM',
      dataIndex: 'pm_name',
      key: 'pm_name',
      width: 96,
      align: 'center' as const,
      onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (value: string | undefined) => (
        <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>
      ),
    },
    {
      title: '建立时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 132,
      align: 'center' as const,
      onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (value: string | undefined) => (
        <span style={{ color: 'var(--text-secondary)' }}>{formatDateTime(value)}</span>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 132,
      align: 'center' as const,
      onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (value: string | undefined, record: ProjectResponse) => (
        <span style={{ color: 'var(--text-secondary)' }}>{formatDateTime(value || record.created_at)}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 96,
      align: 'center' as const,
      onCell: () => ({ style: rowCellStyle }),
      onHeaderCell: centerHeaderCell,
      render: (_: unknown, record: ProjectResponse) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Button
            type="text"
            size="small"
            title="编辑项目"
            onClick={() => onEditProject(record)}
            style={{
              width: '28px',
              minWidth: '28px',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <EditOutlined />
          </Button>
          <Button
            type="text"
            size="small"
            title="删除项目"
            onClick={() => onDeleteProject(record)}
            style={{
              width: '28px',
              minWidth: '28px',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <DeleteOutlined />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div
      className="project-list-card"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div
        className="project-list-card__header"
        style={{
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px) auto',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{subtitle}</div>
        </div>
        <div
          className="project-list-card__search"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            justifySelf: 'stretch',
          }}
        >
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="搜索项目名称 / 客户"
            allowClear
            style={{ flex: '1 1 220px', minWidth: 0 }}
          />
          <Button type="default" style={{ whiteSpace: 'nowrap' }}>
            筛选
          </Button>
        </div>
        <div className="project-list-card__actions" style={{ justifySelf: 'stretch' }}>
          <Button type="primary" onClick={onCreateProject}>新建项目</Button>
        </div>
      </div>
      <div className="project-list-card__table-wrap">
        <Table
          rowKey="id"
          dataSource={projects}
          columns={columns}
          pagination={false}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 1400 }}
          className="project-list-table"
        />
      </div>
    </div>
  );
};

export default ProjectList;
