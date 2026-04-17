import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Checkbox, Empty, Input, message, Modal, Select, Spin } from 'antd';
import ProjectList from '../components/pages/ProjectList';
import Button from '../components/common/Button';
import ProjectSummaryDocument, { hasSummaryContent } from '../components/pages/ProjectSummaryDocument';
import {
  createProject,
  deleteProject,
  exportProjectBackup,
  getProject,
  getProjectDeleteInfo,
  getProjectTemplates,
  getProjects,
  importProjectBackup,
  importProjectDirectory,
  ProjectDirectoryScanCandidate,
  scanProjectDirectories,
  moveProjectFilesToStaging,
  ProjectBackupExportResult,
  ProjectBackupImportResult,
  ProjectDirectoryImportResult,
  ProjectDeleteInfo,
  ProjectResponse,
  ProjectTemplate,
  updateProject,
  UpdateProjectInput,
} from '../api/projects';
import { getSystemSettings, selectDirectory, setExportRoot } from '../api/system';

const DEFAULT_PROJECT_LIST_NAME = '默认清单';
const NEW_PROJECT_LIST_OPTION = '__new__';
const PROJECT_LISTS_CHANGED_EVENT = 'project-lists-changed';

const sortProjectLists = (names: string[]) => {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)));
  const otherNames = uniqueNames
    .filter((name) => name !== DEFAULT_PROJECT_LIST_NAME)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return uniqueNames.includes(DEFAULT_PROJECT_LIST_NAME)
    ? [DEFAULT_PROJECT_LIST_NAME, ...otherNames]
    : otherNames;
};

const normalizeProjectListName = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized || normalized === '项目清单') {
    return DEFAULT_PROJECT_LIST_NAME;
  }
  return normalized;
};

interface ExportRunResult {
  project_id: string;
  project_name: string;
  status: 'success' | 'error';
  export_dir?: string;
  warning_count?: number;
  warnings?: ProjectBackupExportResult['warnings'];
  error_message?: string;
}

interface BatchDirectoryImportRunResult {
  path: string;
  project_name: string;
  customer_name: string;
  status: 'success' | 'error';
  new_project_id?: string;
  new_project_name?: string;
  error_message?: string;
}

interface ProjectFormState {
  project_list_name: string;
  new_project_list_name: string;
  internal_code: string;
  customer_name: string;
  project_name: string;
  annual_revenue_estimate: string;
  engineer_name: string;
  pm_name: string;
  project_template_id: string;
}

const emptyProjectForm: ProjectFormState = {
  project_list_name: DEFAULT_PROJECT_LIST_NAME,
  new_project_list_name: '',
  internal_code: '',
  customer_name: '',
  project_name: '',
  annual_revenue_estimate: '',
  engineer_name: '',
  pm_name: '',
  project_template_id: '',
};

const ProjectListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [projectLists, setProjectLists] = useState<string[]>([]);
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backupMode, setBackupMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [exportRootPath, setExportRootPathState] = useState('');
  const [importRootPath, setImportRootPath] = useState('');
  const [exportRootLoading, setExportRootLoading] = useState(true);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [importingProjectDirectory, setImportingProjectDirectory] = useState(false);
  const [scanningProjectDirectories, setScanningProjectDirectories] = useState(false);
  const [batchImportModalVisible, setBatchImportModalVisible] = useState(false);
  const [batchImportingProjectDirectories, setBatchImportingProjectDirectories] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProjectResponse | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<ProjectResponse | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<ProjectDeleteInfo | null>(null);
  const [deleteInfoLoading, setDeleteInfoLoading] = useState(false);
  const [movingProjectFiles, setMovingProjectFiles] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [summaryPreviewOpen, setSummaryPreviewOpen] = useState(false);
  const [summaryPreviewLoading, setSummaryPreviewLoading] = useState(false);
  const [summaryPreviewProject, setSummaryPreviewProject] = useState<ProjectResponse | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [exportResults, setExportResults] = useState<ExportRunResult[]>([]);
  const [importResult, setImportResult] = useState<(ProjectBackupImportResult & { new_project_name?: string }) | null>(null);
  const [directoryImportResult, setDirectoryImportResult] = useState<(ProjectDirectoryImportResult & { new_project_name?: string }) | null>(null);
  const [batchImportRootDir, setBatchImportRootDir] = useState('');
  const [batchImportCandidates, setBatchImportCandidates] = useState<ProjectDirectoryScanCandidate[]>([]);
  const [selectedBatchImportPaths, setSelectedBatchImportPaths] = useState<string[]>([]);
  const [batchImportResults, setBatchImportResults] = useState<BatchDirectoryImportRunResult[]>([]);
  const activeProjectList = normalizeProjectListName(searchParams.get('projectListName'));

  const cleanupStatusLabelMap: Record<string, string> = {
    deleted: '已清理备份包',
    retained_missing_files: '因缺失文件未清理',
    retained_cleanup_failed: '清理失败，已保留备份包',
    retained_import_failed: '导入失败，已保留备份包',
  };

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    padding: '24px',
    boxSizing: 'border-box',
  };

  const fieldBlockStyle: React.CSSProperties = {
    padding: '10px 12px',
    border: '1px solid var(--border-strong)',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-card-soft)',
  };

  const labelStyle: React.CSSProperties = {
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  };

  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedProjectIds.includes(project.id)),
    [projects, selectedProjectIds],
  );
  const filteredProjects = useMemo(() => {
    const keyword = projectSearch.trim().toLowerCase();
    if (!keyword) {
      return projects;
    }

    return projects.filter((project) => {
      const projectName = project.project_name?.toLowerCase() || '';
      const customerName = project.customer_name?.toLowerCase() || '';
      return projectName.includes(keyword) || customerName.includes(keyword);
    });
  }, [projectSearch, projects]);
  const projectListOptions = useMemo(() => {
    const names = new Set<string>(projectLists);
    if (activeProjectList && projectLists.includes(activeProjectList)) {
      names.add(activeProjectList);
    }
    const currentFormList = projectForm.project_list_name;
    if (currentFormList && currentFormList !== NEW_PROJECT_LIST_OPTION) {
      names.add(currentFormList);
    }
    return sortProjectLists(Array.from(names)).map((name) => ({ label: name, value: name }));
  }, [projectForm.project_list_name, projectLists]);
  const selectedBatchImportCandidates = useMemo(
    () => batchImportCandidates.filter((candidate) => selectedBatchImportPaths.includes(candidate.path)),
    [batchImportCandidates, selectedBatchImportPaths],
  );

  const notifyProjectListsChanged = () => {
    window.dispatchEvent(new Event(PROJECT_LISTS_CHANGED_EVENT));
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProjects(activeProjectList);
      setProjects(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取项目列表失败';
      setError(errorMsg);
      console.error('获取项目列表出错:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectLists = async () => {
    try {
      const allProjects = await getProjects();
      const names = allProjects.map((project) => normalizeProjectListName(project.project_list_name));
      setProjectLists(sortProjectLists(names));
    } catch (err) {
      console.error('获取项目清单分类失败:', err);
    }
  };

  const fetchProjectTemplates = async () => {
    try {
      const data = await getProjectTemplates();
      setProjectTemplates(data);
    } catch (err) {
      console.error('获取项目模板失败:', err);
    }
  };

  const fetchExportRoot = async () => {
    try {
      setExportRootLoading(true);
      const settings = await getSystemSettings();
      setExportRootPathState(settings.export_root);
      setImportRootPath(settings.import_root);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取默认备份路径失败';
      message.error(errorMsg);
    } finally {
      setExportRootLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
  }, [activeProjectList]);

  useEffect(() => {
    void fetchProjectTemplates();
    void fetchExportRoot();
    void fetchProjectLists();
  }, []);

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handlePreviewSummary = async (project: ProjectResponse) => {
    setSummaryPreviewProject(project);
    setSummaryPreviewOpen(true);

    try {
      setSummaryPreviewLoading(true);
      const detail = await getProject(project.id);
      setSummaryPreviewProject(detail);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取 Summary 预览失败';
      message.error(errorMsg);
    } finally {
      setSummaryPreviewLoading(false);
    }
  };

  const closeDeleteProjectModal = (force = false) => {
    if (!force && (deleteInfoLoading || movingProjectFiles || deletingProject)) {
      return;
    }

    setDeleteModalVisible(false);
    setDeletingRecord(null);
    setDeleteInfo(null);
  };

  const refreshDeleteInfo = async (projectId: string) => {
    setDeleteInfoLoading(true);
    try {
      const info = await getProjectDeleteInfo(projectId);
      setDeleteInfo(info);
      return info;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取项目删除信息失败';
      message.error(errorMsg);
      throw err;
    } finally {
      setDeleteInfoLoading(false);
    }
  };

  const resetProjectForm = () => {
    setProjectForm(emptyProjectForm);
  };

  const openCreateProjectModal = () => {
    setEditingRecord(null);
    setProjectForm({
      ...emptyProjectForm,
      project_list_name: activeProjectList,
    });
    setCreateModalVisible(true);
  };

  const openEditProjectModal = (project: ProjectResponse) => {
    setEditingRecord(project);
    setProjectForm({
      project_list_name: normalizeProjectListName(project.project_list_name),
      new_project_list_name: '',
      internal_code: project.internal_code || '',
      customer_name: project.customer_name || '',
      project_name: project.project_name || '',
      annual_revenue_estimate: project.annual_revenue_estimate || '',
      engineer_name: project.engineer_name || '',
      pm_name: project.pm_name || '',
      project_template_id: project.project_template_id || '',
    });
    setEditModalVisible(true);
  };

  const openDeleteProjectModal = async (project: ProjectResponse) => {
    setDeletingRecord(project);
    setDeleteInfo(null);
    setDeleteModalVisible(true);
    try {
      await refreshDeleteInfo(project.id);
    } catch (_err) {
      // error already surfaced via message; keep modal open so user can retry or cancel
    }
  };

  const handleProjectFieldChange = (field: keyof ProjectFormState, value: string) => {
    setProjectForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resolveProjectListName = () => {
    if (projectForm.project_list_name === NEW_PROJECT_LIST_OPTION) {
      return projectForm.new_project_list_name.trim();
    }
    return projectForm.project_list_name.trim() || DEFAULT_PROJECT_LIST_NAME;
  };

  const buildProjectPayload = (): UpdateProjectInput => ({
    project_list_name: resolveProjectListName(),
    internal_code: projectForm.internal_code.trim() || undefined,
    customer_name: projectForm.customer_name.trim(),
    project_name: projectForm.project_name.trim(),
    annual_revenue_estimate: projectForm.annual_revenue_estimate.trim() || undefined,
    engineer_name: projectForm.engineer_name.trim() || undefined,
    pm_name: projectForm.pm_name.trim() || undefined,
    project_template_id: projectForm.project_template_id || undefined,
  });

  const validateProjectPayload = (payload: UpdateProjectInput) => {
    if (!payload.project_list_name) {
      message.error('所属清单不能为空');
      return false;
    }
    if (!payload.customer_name || !payload.project_name) {
      message.error('客户和项目名称不能为空');
      return false;
    }
    return true;
  };

  const handleCreateProject = async () => {
    const payload = buildProjectPayload();
    if (!validateProjectPayload(payload)) {
      return;
    }

    try {
      setCreatingProject(true);
      await createProject(payload);
      message.success('项目创建成功');
      setCreateModalVisible(false);
      resetProjectForm();
      await fetchProjects();
      await fetchProjectLists();
      notifyProjectListsChanged();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '创建项目失败';
      message.error(errorMsg);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!editingRecord) {
      return;
    }

    const payload = buildProjectPayload();
    if (!validateProjectPayload(payload)) {
      return;
    }

    try {
      setEditingProject(true);
      await updateProject(editingRecord.id, payload);
      message.success('项目更新成功');
      setEditModalVisible(false);
      setEditingRecord(null);
      resetProjectForm();
      await fetchProjects();
      await fetchProjectLists();
      notifyProjectListsChanged();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '更新项目失败';
      message.error(errorMsg);
    } finally {
      setEditingProject(false);
    }
  };

  const handleMoveProjectFilesToStaging = async () => {
    if (!deletingRecord) {
      return;
    }

    try {
      setMovingProjectFiles(true);
      const result = await moveProjectFilesToStaging(deletingRecord.id);
      message.success(`已转移 ${result.moved_count} 个文件到待上传文件夹`);
      await refreshDeleteInfo(deletingRecord.id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '转移项目文件失败';
      message.error(errorMsg);
    } finally {
      setMovingProjectFiles(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingRecord || !deleteInfo || !deleteInfo.can_delete_directly) {
      return;
    }

    try {
      setDeletingProject(true);
      const result = await deleteProject(deletingRecord.id);
      message.success(result.message);
      closeDeleteProjectModal(true);
      await fetchProjects();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '删除项目失败';
      message.error(errorMsg);
    } finally {
      setDeletingProject(false);
    }
  };

  const handleEnterBackupMode = () => {
    setBackupMode(true);
    setSelectedProjectIds([]);
    setExportResults([]);
  };

  const handleCancelBackupMode = () => {
    setBackupMode(false);
    setSelectedProjectIds([]);
  };

  const handleToggleSelectProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectedProjectIds(checked ? projects.map((project) => project.id) : []);
  };

  const runBatchExport = async () => {
    if (selectedProjects.length === 0) {
      message.warning('请先选择至少一个项目');
      return;
    }

    try {
      setExportingBackup(true);
      const results: ExportRunResult[] = [];

      for (const project of selectedProjects) {
        try {
          const result = await exportProjectBackup(project.id);
          results.push({
            project_id: project.id,
            project_name: project.project_name,
            status: 'success',
            export_dir: result.export_dir,
            warning_count: result.warning_count,
            warnings: result.warnings,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '导出失败';
          results.push({
            project_id: project.id,
            project_name: project.project_name,
            status: 'error',
            error_message: errorMsg,
          });
        }
      }

      setExportResults(results);
      const successCount = results.filter((item) => item.status === 'success').length;
      const failureCount = results.length - successCount;
      if (failureCount === 0) {
        message.success(`已完成 ${successCount} 个项目备份`);
      } else {
        message.warning(`备份完成：成功 ${successCount} 个，失败 ${failureCount} 个`);
      }
    } finally {
      setExportingBackup(false);
    }
  };

  const handleExportToDefault = async () => {
    await runBatchExport();
  };

  const handleChooseExportLocation = async () => {
    if (selectedProjects.length === 0) {
      message.warning('请先选择至少一个项目');
      return;
    }

    try {
      const selectedPath = await selectDirectory('选择备份导出目录', exportRootPath || undefined);
      const updated = await setExportRoot(selectedPath);
      setExportRootPathState(updated.path);
      await runBatchExport();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '选择导出目录失败';
      message.error(errorMsg);
    }
  };

  const handleImportBackup = async () => {
    try {
      setImportingBackup(true);
      const selectedBackupDir = await selectDirectory('选择标准备份目录', importRootPath || exportRootPath || undefined);
      const result = await importProjectBackup(selectedBackupDir);
      let newProjectName: string | undefined;

      try {
        const importedProject = await getProject(result.new_project_id);
        newProjectName = importedProject.project_name;
      } catch (err) {
        console.error('获取导入后项目详情失败:', err);
      }

      setImportResult({
        ...result,
        new_project_name: newProjectName,
      });
      message.success('备份目录导入成功');
      await fetchProjects();
      await fetchProjectLists();
      notifyProjectListsChanged();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '导入备份目录失败';
      message.error(errorMsg);
      console.error('导入备份目录出错:', err);
    } finally {
      setImportingBackup(false);
    }
  };

  const handleImportProjectDirectory = async () => {
    try {
      setImportingProjectDirectory(true);
      const selectedProjectDir = await selectDirectory('选择包含 .project_meta.json 的项目根目录', importRootPath || exportRootPath || undefined);
      const result = await importProjectDirectory(selectedProjectDir);
      let newProjectName: string | undefined;

      try {
        const importedProject = await getProject(result.new_project_id);
        newProjectName = importedProject.project_name;
      } catch (err) {
        console.error('获取项目目录导入后的项目详情失败:', err);
      }

      setDirectoryImportResult({
        ...result,
        new_project_name: newProjectName,
      });
      message.success('项目目录导入成功');
      await fetchProjects();
      await fetchProjectLists();
      notifyProjectListsChanged();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '导入项目目录失败';
      message.error(errorMsg);
      console.error('导入项目目录出错:', err);
    } finally {
      setImportingProjectDirectory(false);
    }
  };

  const closeBatchImportModal = () => {
    if (batchImportingProjectDirectories) {
      return;
    }

    setBatchImportModalVisible(false);
    setBatchImportRootDir('');
    setBatchImportCandidates([]);
    setSelectedBatchImportPaths([]);
    setBatchImportResults([]);
  };

  const handleOpenBatchImportProjectDirectories = async () => {
    try {
      setScanningProjectDirectories(true);
      const selectedRootDir = await selectDirectory('选择包含多个项目目录的根目录', importRootPath || exportRootPath || undefined);
      const scanResult = await scanProjectDirectories(selectedRootDir);
      if (scanResult.items.length === 0) {
        message.warning('未扫描到可导入的项目目录');
        return;
      }

      setBatchImportRootDir(selectedRootDir);
      setBatchImportCandidates(scanResult.items);
      setSelectedBatchImportPaths(scanResult.items.map((item) => item.path));
      setBatchImportResults([]);
      setBatchImportModalVisible(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '扫描项目目录失败';
      message.error(errorMsg);
    } finally {
      setScanningProjectDirectories(false);
    }
  };

  const handleToggleBatchImportPath = (path: string, checked: boolean) => {
    setSelectedBatchImportPaths((prev) => {
      if (checked) {
        return prev.includes(path) ? prev : [...prev, path];
      }
      return prev.filter((item) => item !== path);
    });
  };

  const handleToggleSelectAllBatchImports = (checked: boolean) => {
    setSelectedBatchImportPaths(checked ? batchImportCandidates.map((item) => item.path) : []);
  };

  const handleBatchImportProjectDirectories = async () => {
    if (selectedBatchImportCandidates.length === 0) {
      message.warning('请先选择至少一个项目目录');
      return;
    }

    try {
      setBatchImportingProjectDirectories(true);
      const results: BatchDirectoryImportRunResult[] = [];

      for (const candidate of selectedBatchImportCandidates) {
        try {
          const result = await importProjectDirectory(candidate.path);
          let newProjectName: string | undefined;

          try {
            const importedProject = await getProject(result.new_project_id);
            newProjectName = importedProject.project_name;
          } catch (err) {
            console.error('获取批量导入后的项目详情失败:', err);
          }

          results.push({
            path: candidate.path,
            project_name: candidate.project_name,
            customer_name: candidate.customer_name,
            status: 'success',
            new_project_id: result.new_project_id,
            new_project_name: newProjectName,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '导入失败';
          results.push({
            path: candidate.path,
            project_name: candidate.project_name,
            customer_name: candidate.customer_name,
            status: 'error',
            error_message: errorMsg,
          });
        }
      }

      setBatchImportResults(results);
      const successCount = results.filter((item) => item.status === 'success').length;
      const failureCount = results.length - successCount;
      if (successCount > 0) {
        await fetchProjects();
        await fetchProjectLists();
        notifyProjectListsChanged();
      }

      if (failureCount === 0) {
        message.success(`批量导入完成：成功 ${successCount} 个`);
      } else {
        message.warning(`批量导入完成：成功 ${successCount} 个，失败 ${failureCount} 个`);
      }
    } finally {
      setBatchImportingProjectDirectories(false);
    }
  };

  const renderProjectModalContent = () => (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>所属清单</div>
        <Select
          value={projectForm.project_list_name}
          onChange={(value) => handleProjectFieldChange('project_list_name', value)}
          options={[
            ...projectListOptions,
            { label: '新建清单', value: NEW_PROJECT_LIST_OPTION },
          ]}
        />
        {projectForm.project_list_name === NEW_PROJECT_LIST_OPTION ? (
          <Input
            style={{ marginTop: '10px' }}
            value={projectForm.new_project_list_name}
            onChange={(e) => handleProjectFieldChange('new_project_list_name', e.target.value)}
            placeholder="输入新的清单名称"
          />
        ) : null}
      </div>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>客户</div>
        <Input
          value={projectForm.customer_name}
          onChange={(e) => handleProjectFieldChange('customer_name', e.target.value)}
          placeholder="输入客户名称"
        />
      </div>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>项目名称</div>
        <Input
          value={projectForm.project_name}
          onChange={(e) => handleProjectFieldChange('project_name', e.target.value)}
          placeholder="输入项目名称"
        />
      </div>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>内部代码</div>
        <Input
          value={projectForm.internal_code}
          onChange={(e) => handleProjectFieldChange('internal_code', e.target.value)}
          placeholder="输入内部代码"
        />
      </div>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>预计年营收</div>
        <Input
          value={projectForm.annual_revenue_estimate}
          onChange={(e) => handleProjectFieldChange('annual_revenue_estimate', e.target.value)}
          placeholder="例如 1200 万 / 2.5M USD"
        />
      </div>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>负责工程师</div>
        <Input
          value={projectForm.engineer_name}
          onChange={(e) => handleProjectFieldChange('engineer_name', e.target.value)}
          placeholder="输入负责工程师"
        />
      </div>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>PM</div>
        <Input
          value={projectForm.pm_name}
          onChange={(e) => handleProjectFieldChange('pm_name', e.target.value)}
          placeholder="输入 PM"
        />
      </div>
      <div style={fieldBlockStyle}>
        <div style={labelStyle}>项目模板</div>
        <Select
          value={projectForm.project_template_id || undefined}
          allowClear
          placeholder="可选"
          onChange={(value) => handleProjectFieldChange('project_template_id', value || '')}
          options={projectTemplates.map((template) => ({
            label: template.template_name,
            value: template.id,
          }))}
        />
      </div>
    </div>
  );

  const renderDeleteProjectModalContent = () => (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
        删除项目前会先检查项目目录中的实际文件。若仍有文件，请先转到待上传文件夹。
      </div>
      <div
        style={{
          padding: '12px',
          border: '1px solid var(--border-strong)',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-card-soft)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '8px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>客户</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{deletingRecord?.customer_name || '-'}</span>
          <span style={{ color: 'var(--text-secondary)' }}>项目名称</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{deletingRecord?.project_name || '-'}</span>
          <span style={{ color: 'var(--text-secondary)' }}>文件数</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {deleteInfoLoading ? '加载中...' : deleteInfo?.file_count ?? '-'}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>删除方式</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {deleteInfo?.delete_mode === 'db_only' ? '仅删除项目记录' : '删除项目记录与目录'}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '12px',
          borderRadius: '10px',
          border: `1px solid ${deleteInfo?.can_delete_directly ? 'var(--border-strong)' : 'var(--warning-border)'}`,
          backgroundColor: deleteInfo?.can_delete_directly ? 'var(--bg-card-muted)' : 'var(--warning-soft)',
          color: deleteInfo?.can_delete_directly ? 'var(--text-primary)' : 'var(--warning-text)',
          fontSize: '13px',
          lineHeight: 1.5,
        }}
      >
        {deleteInfoLoading ? '正在检查项目文件与目录状态…' : deleteInfo?.message || '等待检查结果…'}
      </div>

      {!deleteInfoLoading ? (
        <div
          style={{
            padding: '12px',
            border: '1px solid var(--border-strong)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-card)',
            display: 'grid',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>辅助动作</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              onClick={handleMoveProjectFilesToStaging}
              loading={movingProjectFiles}
              disabled={!deleteInfo?.can_move_files_to_staging}
            >
              转到待上传文件夹
            </Button>
          </div>
          {!deleteInfo?.can_move_files_to_staging && deleteInfo?.file_count ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {deleteInfo.folder_in_allowed_delete_scope
                ? '当前目录无法自动转移，请先检查项目目录状态。'
                : '项目目录不在允许自动处理范围内，请先手动整理文件后再删除。'}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const toolbar = (
    <div
      style={{
        marginBottom: '16px',
        padding: '16px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        display: 'grid',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{activeProjectList}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>在这里完成当前清单的项目备份、导入与项目信息维护。</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Button onClick={handleEnterBackupMode} disabled={backupMode}>
            备份
          </Button>
          <Button type="primary" onClick={handleImportBackup} loading={importingBackup}>
            导入备份
          </Button>
          <Button onClick={handleImportProjectDirectory} loading={importingProjectDirectory}>
            导入项目目录
          </Button>
          <Button onClick={handleOpenBatchImportProjectDirectories} loading={scanningProjectDirectories}>
            批量导入项目目录
          </Button>
        </div>
      </div>

      <div
        style={{
          padding: '10px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border-strong)',
          backgroundColor: 'var(--bg-card-muted)',
          color: 'var(--text-primary)',
          fontSize: '13px',
        }}
      >
        默认备份路径：
        <span style={{ marginLeft: '8px', color: 'var(--text-primary)', fontWeight: 600 }}>
          {exportRootLoading ? '加载中...' : exportRootPath || '未设置'}
        </span>
      </div>

      {backupMode ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '10px 12px',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card-soft)',
          }}
        >
          <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>已选 {selectedProjectIds.length} 项</div>
          <Button type="primary" onClick={handleExportToDefault} loading={exportingBackup}>
            导出到默认位置
          </Button>
          <Button onClick={handleChooseExportLocation} loading={exportingBackup}>
            另选位置
          </Button>
          <Button onClick={handleCancelBackupMode} disabled={exportingBackup}>
            取消
          </Button>
        </div>
      ) : null}

      {exportResults.length > 0 ? (
        <div
          style={{
            padding: '12px 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card-muted)',
            display: 'grid',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>备份结果</div>
          {exportResults.map((result) => (
            <div
              key={`${result.project_id}-${result.status}`}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-strong)',
                backgroundColor: 'var(--bg-card)',
                display: 'grid',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{result.project_name}</span>
                <span
                  style={{
                    color: result.status === 'success' ? 'var(--success-text)' : 'var(--danger-color)',
                    fontSize: '12px',
                  }}
                >
                  {result.status === 'success' ? '成功' : '失败'}
                </span>
              </div>
              {result.status === 'success' ? (
                <>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>export_dir：{result.export_dir}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>warning_count：{result.warning_count ?? 0}</div>
                  {result.warnings && result.warnings.length > 0 ? (
                    <div style={{ display: 'grid', gap: '4px' }}>
                      {result.warnings.map((warning, index) => (
                        <div
                          key={`${warning.code}-${warning.source_uploaded_file_id || index}`}
                          style={{ color: 'var(--text-muted)', fontSize: '12px' }}
                        >
                          <strong style={{ color: 'var(--text-primary)' }}>{warning.code}</strong>
                          {' - '}
                          {warning.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{result.error_message}</div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {importResult ? (
        <div
          style={{
            padding: '12px 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card-muted)',
            display: 'grid',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>导入结果</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>新项目 ID：{importResult.new_project_id}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>新项目名称：{importResult.new_project_name || '未获取'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <span>Part：{importResult.imported_part_count}</span>
            <span>Slot：{importResult.imported_slot_count}</span>
            <span>文件：{importResult.imported_file_count}</span>
            <span>缺失文件：{importResult.missing_file_count}</span>
            <span>Warnings：{importResult.warning_count}</span>
          </div>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-strong)',
              backgroundColor: 'var(--bg-card)',
              display: 'grid',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>清包结果</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              cleanup_status：
              <span style={{ marginLeft: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>
                {cleanupStatusLabelMap[importResult.package_cleanup_status] || importResult.package_cleanup_status}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
              <span>已删除包：{importResult.deleted_package_count}</span>
              <span>已保留包：{importResult.retained_package_count}</span>
            </div>
          </div>
          {importResult.warnings.length > 0 ? (
            <div style={{ display: 'grid', gap: '6px' }}>
              {importResult.warnings.map((warning, index) => (
                <div
                  key={`${warning.code}-${warning.source_uploaded_file_id || index}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>{warning.code}</strong>
                  {' - '}
                  {warning.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {directoryImportResult ? (
        <div
          style={{
            padding: '12px 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card-muted)',
            display: 'grid',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>项目目录导入结果</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>新项目 ID：{directoryImportResult.new_project_id}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>新项目名称：{directoryImportResult.new_project_name || '未获取'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <span>Part：{directoryImportResult.imported_part_count}</span>
            <span>Slot：{directoryImportResult.imported_slot_count}</span>
            <span>文件：{directoryImportResult.imported_file_count}</span>
            <span>Summary 历史：{directoryImportResult.imported_summary_history_count}</span>
            <span>缺失文件：{directoryImportResult.missing_file_count}</span>
            <span>Warnings：{directoryImportResult.warning_count}</span>
          </div>
          {directoryImportResult.warnings.length > 0 ? (
            <div style={{ display: 'grid', gap: '6px' }}>
              {directoryImportResult.warnings.map((warning, index) => (
                <div
                  key={`${warning.code}-${warning.source_uploaded_file_id || index}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>{warning.code}</strong>
                  {' - '}
                  {warning.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const projectListContent = (
    <ProjectList
      projects={filteredProjects}
      title={activeProjectList}
      subtitle="管理当前清单下的项目基础信息与备份入口。"
      searchValue={projectSearch}
      onSearchChange={setProjectSearch}
      onViewProject={handleViewProject}
      onPreviewSummary={handlePreviewSummary}
      onCreateProject={openCreateProjectModal}
      onEditProject={openEditProjectModal}
      onDeleteProject={openDeleteProjectModal}
      backupMode={backupMode}
      selectedProjectIds={selectedProjectIds}
      onToggleSelectProject={handleToggleSelectProject}
      onToggleSelectAll={handleToggleSelectAll}
    />
  );

  const batchImportModalContent = (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div
        style={{
          padding: '12px',
          border: '1px solid var(--border-strong)',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-card-soft)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>扫描目录</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', wordBreak: 'break-all' }}>{batchImportRootDir || '-'}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
          候选项目 {batchImportCandidates.length} 个，已选 {selectedBatchImportPaths.length} 个
        </div>
        <Checkbox
          checked={batchImportCandidates.length > 0 && selectedBatchImportPaths.length === batchImportCandidates.length}
          indeterminate={selectedBatchImportPaths.length > 0 && selectedBatchImportPaths.length < batchImportCandidates.length}
          onChange={(e) => handleToggleSelectAllBatchImports(e.target.checked)}
        >
          全选
        </Checkbox>
      </div>

      <div
        style={{
          height: '360px',
          overflow: 'auto',
          border: '1px solid var(--border-strong)',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-card)',
          padding: '8px',
          display: 'grid',
          gap: '8px',
        }}
      >
        {batchImportCandidates.map((candidate) => (
          <label
            key={candidate.path}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr)',
              gap: '10px',
              alignItems: 'flex-start',
              padding: '10px 12px',
              border: '1px solid var(--border-strong)',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-card-soft)',
              cursor: 'pointer',
            }}
          >
            <Checkbox
              checked={selectedBatchImportPaths.includes(candidate.path)}
              onChange={(e) => handleToggleBatchImportPath(candidate.path, e.target.checked)}
            />
            <div style={{ display: 'grid', gap: '4px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{candidate.project_name}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{formatDateTime(candidate.updated_at)}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '12px' }}>
                <span>客户：{candidate.customer_name || '-'}</span>
                <span>内部代码：{candidate.internal_code || '-'}</span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', wordBreak: 'break-all' }}>{candidate.path}</div>
            </div>
          </label>
        ))}
      </div>

      {batchImportResults.length > 0 ? (
        <div
          style={{
            padding: '12px',
            border: '1px solid var(--border-strong)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-card-muted)',
            display: 'grid',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>批量导入结果</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <span>成功：{batchImportResults.filter((item) => item.status === 'success').length}</span>
            <span>失败：{batchImportResults.filter((item) => item.status === 'error').length}</span>
          </div>
          <div style={{ maxHeight: '180px', overflow: 'auto', display: 'grid', gap: '6px' }}>
            {batchImportResults.map((result) => (
              <div
                key={`${result.path}-${result.status}`}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-card)',
                  display: 'grid',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{result.project_name}</span>
                  <span style={{ color: result.status === 'success' ? 'var(--success-text)' : 'var(--danger-color)', fontSize: '12px' }}>
                    {result.status === 'success' ? '成功' : '失败'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', wordBreak: 'break-all' }}>{result.path}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  {result.status === 'success'
                    ? `新项目：${result.new_project_name || result.new_project_id || '-'}`
                    : result.error_message}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div style={pageStyle}>
      {toolbar}
      {loading ? (
        <Spin size="large" tip="加载中..." style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '500px' }} />
      ) : error ? (
        <Empty description={`加载失败: ${error}`} style={{ marginTop: '50px' }} />
      ) : filteredProjects.length === 0 ? (
        <>
          {projectListContent}
          <Empty description={projects.length === 0 ? '暂无项目' : '未找到匹配的项目'} style={{ marginTop: '50px' }} />
        </>
      ) : (
        projectListContent
      )}

      <Modal
        title="新建项目"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          resetProjectForm();
        }}
        onOk={handleCreateProject}
        okText="创建"
        cancelText="取消"
        confirmLoading={creatingProject}
        destroyOnClose
      >
        {renderProjectModalContent()}
      </Modal>

      <Modal
        title="编辑项目"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingRecord(null);
          resetProjectForm();
        }}
        onOk={handleUpdateProject}
        okText="保存"
        cancelText="取消"
        confirmLoading={editingProject}
        destroyOnClose
      >
        {renderProjectModalContent()}
      </Modal>

      <Modal
        title="删除项目"
        open={deleteModalVisible}
        onCancel={() => closeDeleteProjectModal()}
        onOk={handleDeleteProject}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{
          danger: true,
          disabled: deleteInfoLoading || !deleteInfo?.can_delete_directly,
        }}
        confirmLoading={deletingProject}
        destroyOnClose
      >
        {renderDeleteProjectModalContent()}
      </Modal>

      <Modal
        title="批量导入项目目录"
        open={batchImportModalVisible}
        onCancel={closeBatchImportModal}
        onOk={handleBatchImportProjectDirectories}
        okText="导入"
        cancelText="取消"
        okButtonProps={{ disabled: selectedBatchImportPaths.length === 0 }}
        confirmLoading={batchImportingProjectDirectories}
        width={920}
        destroyOnClose
      >
        {batchImportModalContent}
      </Modal>

      <Modal
        title={summaryPreviewProject ? `${summaryPreviewProject.project_name} Summary` : 'Summary 预览'}
        open={summaryPreviewOpen}
        onCancel={() => {
          if (summaryPreviewLoading) {
            return;
          }
          setSummaryPreviewOpen(false);
        }}
        footer={null}
        width={920}
        destroyOnClose
        styles={{
          body: {
            height: '76vh',
            overflow: 'hidden',
          },
        }}
      >
        {summaryPreviewProject ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: '12px',
            }}
          >
            <Button
              type="primary"
              onClick={() => {
                setSummaryPreviewOpen(false);
                navigate(`/projects/${summaryPreviewProject.id}?tab=summary&mode=edit`);
              }}
            >
              编辑 Summary
            </Button>
          </div>
        ) : null}
        {summaryPreviewLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Spin size="small" tip="Summary 加载中..." />
          </div>
        ) : summaryPreviewProject && hasSummaryContent(summaryPreviewProject) ? (
          <div
            style={{
              border: '1px solid var(--border-strong)',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-card)',
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <ProjectSummaryDocument source={summaryPreviewProject} minHeight={320} height="100%" />
          </div>
        ) : (
          <Empty description="该项目暂无 Summary 内容" style={{ margin: '36px 0' }} />
        )}
      </Modal>
    </div>
  );
};

export default ProjectListPage;
