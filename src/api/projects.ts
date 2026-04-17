import { JSONContent } from '@tiptap/core';
import { apiClient } from './client';

export interface CreateProjectInput {
  project_list_name?: string;
  internal_code?: string;
  customer_name: string;
  project_name: string;
  annual_revenue_estimate?: string;
  engineer_name?: string;
  pm_name?: string;
  template_name?: string;
  project_template_id?: string;
}

export interface UpdateProjectInput {
  project_list_name?: string;
  internal_code?: string;
  customer_name: string;
  project_name: string;
  annual_revenue_estimate?: string;
  engineer_name?: string;
  pm_name?: string;
  template_name?: string;
  project_template_id?: string;
}

export interface UpdateProjectSummaryInput {
  summary_json?: JSONContent | null;
}

export interface ProjectSummaryHistory {
  id: string;
  project_id: string;
  version_no: number;
  summary_json?: JSONContent | null;
  legacy_summary_html?: string | null;
  created_at: string;
}

export interface ProjectListMutationResult {
  message: string;
}

export interface ProjectResponse {
  id: string;
  project_list_name?: string;
  internal_code?: string;
  customer_name: string;
  project_name: string;
  annual_revenue_estimate?: string;
  engineer_name?: string;
  pm_name?: string;
  template_name?: string;
  project_template_id?: string;
  summary_json?: JSONContent | null;
  legacy_summary_html?: string | null;
  summary_updated_at?: string | null;
  default_slot_template_id?: string;
  default_slot_template_name?: string;
  root_path?: string;
  created_at: string;
  updated_at?: string;
}

export interface ProjectDeleteInfo {
  project_id: string;
  customer_name: string;
  project_name: string;
  file_count: number;
  folder_exists: boolean;
  folder_in_allowed_delete_scope: boolean;
  can_move_files_to_staging: boolean;
  can_delete_directly: boolean;
  delete_mode: string;
  message: string;
}

export interface MoveProjectFilesResult {
  moved_count: number;
  staging_dir: string;
}

export interface ProjectDeleteResult {
  status: string;
  message: string;
  deleted_folder: boolean;
  deleted_record: boolean;
}

export interface SlotTemplate {
  id: string;
  template_name: string;
  description?: string;
  recommended_part_type?: string;
  created_at: string;
}

export interface ProjectPart {
  id: string;
  part_no?: string;
  part_name: string;
  part_type?: string;
  parent_part_no?: string;
  remark?: string;
}

export interface CreateProjectPartInput {
  part_no: string;
  part_name: string;
  part_type?: string;
  parent_part_no?: string;
  remark?: string;
  slot_template_id?: string | null;
}

export interface UpdateProjectPartInput {
  part_type?: string;
  parent_part_no?: string | null;
  remark?: string | null;
}

export interface ProjectPartDeleteInfo {
  part_id: string;
  part_no?: string;
  part_name: string;
  file_count: number;
  child_part_count: number;
  folder_exists: boolean;
}

export interface MovePartFilesResult {
  moved_count: number;
  staging_dir: string;
}

export interface PartSlotsSummary {
  part_id: string;
  slot_id: string;
  slot_name: string;
  latest_filename?: string;
  latest_upload_at?: string;
}

export interface ApplyTemplateResult {
  template_id: string;
  template_name: string;
  created_count: number;
  skipped_count: number;
  part_count: number;
}

export interface CreateProjectPartSlotInput {
  slot_name: string;
  group_type: 'external' | 'internal';
  sort_order?: number | null;
}

export interface ProjectDocumentSlot {
  slot_id: string;
  part_id: string;
  group_type: string;
  document_type: string;
  has_file: boolean;
  latest_filename?: string;
  latest_upload_at?: string;
  note?: string;
}

export interface ProjectTemplate {
  id: string;
  template_name: string;
  description?: string;
}

export interface ProjectExistingFile {
  uploaded_file_id: string;
  slot_id: string;
  part_id: string;
  filename: string;
  file_type: string;
  group_type: string;
  part_name?: string;
  part_no?: string;
  slot_name: string;
  uploaded_at: string;
  is_latest: boolean;
}

export interface ProjectExistingFilePreview {
  uploaded_file_id: string;
  filename: string;
  file_type: string;
  preview_kind: 'text' | 'pdf' | 'image' | 'unsupported';
  text_content?: string | null;
}

export interface BackupWarning {
  code: string;
  level: string;
  message: string;
  source_project_id?: string | null;
  source_part_id?: string | null;
  source_slot_id?: string | null;
  source_uploaded_file_id?: string | null;
  relative_path?: string | null;
  original_relative_path?: string | null;
}

export interface ProjectBackupExportResult {
  export_dir: string;
  manifest_path: string;
  copied_file_count: number;
  missing_file_count: number;
  warning_count: number;
  warnings: BackupWarning[];
}

export interface ProjectBackupImportResult {
  new_project_id: string;
  imported_part_count: number;
  imported_slot_count: number;
  imported_file_count: number;
  missing_file_count: number;
  package_cleanup_status: string;
  deleted_package_count: number;
  retained_package_count: number;
  warning_count: number;
  warnings: BackupWarning[];
}

export interface ProjectDirectoryImportResult {
  new_project_id: string;
  imported_part_count: number;
  imported_slot_count: number;
  imported_file_count: number;
  imported_summary_history_count: number;
  missing_file_count: number;
  warning_count: number;
  warnings: BackupWarning[];
}

export interface ProjectDirectoryScanCandidate {
  project_name: string;
  customer_name: string;
  internal_code?: string;
  updated_at?: string | null;
  path: string;
}

export interface ProjectDirectoryScanResult {
  items: ProjectDirectoryScanCandidate[];
}

export async function getProjects(projectListName?: string): Promise<ProjectResponse[]> {
  const query = projectListName ? `?project_list_name=${encodeURIComponent(projectListName)}` : '';
  return apiClient.get<ProjectResponse[]>(`/projects${query}`);
}

export async function getProject(projectId: string): Promise<ProjectResponse> {
  return apiClient.get<ProjectResponse>(`/projects/${projectId}`);
}

export async function exportProjectBackup(projectId: string): Promise<ProjectBackupExportResult> {
  return apiClient.post<ProjectBackupExportResult, Record<string, never>>(
    `/projects/${projectId}/export-backup`,
    {},
  );
}

export async function importProjectBackup(backupDir: string): Promise<ProjectBackupImportResult> {
  return apiClient.post<ProjectBackupImportResult, { backup_dir: string }>(
    '/projects/backup/import',
    { backup_dir: backupDir },
  );
}

export async function importProjectDirectory(projectDir: string): Promise<ProjectDirectoryImportResult> {
  return apiClient.post<ProjectDirectoryImportResult, { project_dir: string }>(
    '/projects/directory/import',
    { project_dir: projectDir },
  );
}

export async function scanProjectDirectories(rootDir: string): Promise<ProjectDirectoryScanResult> {
  return apiClient.post<ProjectDirectoryScanResult, { root_dir: string }>(
    '/projects/directory/scan',
    { root_dir: rootDir },
  );
}

export async function createProject(data: CreateProjectInput): Promise<ProjectResponse> {
  return apiClient.post<ProjectResponse, CreateProjectInput>('/projects', data);
}

export async function updateProject(projectId: string, data: UpdateProjectInput): Promise<ProjectResponse> {
  return apiClient.request<ProjectResponse>(`/projects/${projectId}`, {
    method: 'PUT',
    body: data as any,
  });
}

export async function updateProjectSummary(
  projectId: string,
  data: UpdateProjectSummaryInput,
): Promise<ProjectResponse> {
  return apiClient.request<ProjectResponse>(`/projects/${projectId}/summary`, {
    method: 'PUT',
    body: data as any,
  });
}

export async function renameProjectList(oldName: string, newName: string): Promise<ProjectListMutationResult> {
  return apiClient.post<ProjectListMutationResult, { old_name: string; new_name: string }>(
    '/projects/project-lists/rename',
    { old_name: oldName, new_name: newName },
  );
}

export async function deleteProjectList(projectListName: string): Promise<ProjectListMutationResult> {
  return apiClient.request<ProjectListMutationResult>(
    `/projects/project-lists/${encodeURIComponent(projectListName)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function getProjectSummaryHistory(projectId: string): Promise<ProjectSummaryHistory[]> {
  return apiClient.get<ProjectSummaryHistory[]>(`/projects/${projectId}/summary/history`);
}

export async function restoreProjectSummaryHistory(projectId: string, historyId: string): Promise<ProjectResponse> {
  return apiClient.post<ProjectResponse, Record<string, never>>(
    `/projects/${projectId}/summary/history/${historyId}/restore`,
    {},
  );
}

export async function deleteProject(projectId: string): Promise<{ message: string }> {
  return apiClient.request<ProjectDeleteResult>(`/projects/${projectId}`, {
    method: 'DELETE',
  });
}

export async function getProjectDeleteInfo(projectId: string): Promise<ProjectDeleteInfo> {
  return apiClient.get<ProjectDeleteInfo>(`/projects/${projectId}/delete-info`);
}

export async function moveProjectFilesToStaging(projectId: string): Promise<MoveProjectFilesResult> {
  return apiClient.post<MoveProjectFilesResult, Record<string, never>>(
    `/projects/${projectId}/move-files-to-staging`,
    {},
  );
}

export async function getProjectTemplates(): Promise<ProjectTemplate[]> {
  return apiClient.get<ProjectTemplate[]>('/projects/templates');
}

export async function getSlotTemplates(): Promise<SlotTemplate[]> {
  return apiClient.get<SlotTemplate[]>('/projects/slot-templates');
}

export async function getProjectParts(projectId: string): Promise<ProjectPart[]> {
  return apiClient.get<ProjectPart[]>(`/projects/${projectId}/parts`);
}

export async function createProjectPart(projectId: string, data: CreateProjectPartInput): Promise<ProjectPart> {
  return apiClient.post<ProjectPart, CreateProjectPartInput>(`/projects/${projectId}/parts`, data);
}

export async function updateProjectPart(
  projectId: string,
  partId: string,
  data: UpdateProjectPartInput,
): Promise<ProjectPart> {
  return apiClient.request<ProjectPart>(`/projects/${projectId}/parts/${partId}`, {
    method: 'PUT',
    body: data as any,
  });
}

export async function getProjectPartDeleteInfo(projectId: string, partId: string): Promise<ProjectPartDeleteInfo> {
  return apiClient.get<ProjectPartDeleteInfo>(`/projects/${projectId}/parts/${partId}/delete-info`);
}

export async function openProjectPartFolder(projectId: string, partId: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }, {}>(`/projects/${projectId}/parts/${partId}/open-folder`, {});
}

export async function moveProjectPartFilesToStaging(projectId: string, partId: string): Promise<MovePartFilesResult> {
  return apiClient.post<MovePartFilesResult, {}>(`/projects/${projectId}/parts/${partId}/move-files-to-staging`, {});
}

export async function deleteProjectPart(projectId: string, partId: string): Promise<{ message: string }> {
  return apiClient.request<{ message: string }>(`/projects/${projectId}/parts/${partId}`, {
    method: 'DELETE',
  });
}

export async function getPartSlotsSummary(projectId: string): Promise<PartSlotsSummary[]> {
  return apiClient.get<PartSlotsSummary[]>(`/projects/${projectId}/part-slots-summary`);
}

export async function applyTemplateToProject(projectId: string, templateId: string): Promise<ApplyTemplateResult> {
  return apiClient.post<ApplyTemplateResult, { template_id: string }>(`/projects/${projectId}/apply-template`, {
    template_id: templateId,
  });
}

export async function createProjectPartSlot(
  projectId: string,
  partId: string,
  data: CreateProjectPartSlotInput,
): Promise<ProjectDocumentSlot> {
  return apiClient.post<ProjectDocumentSlot, CreateProjectPartSlotInput>(
    `/projects/${projectId}/parts/${partId}/slots`,
    data,
  );
}

export async function importProjectPartsExcel(projectId: string, formData: FormData): Promise<{ imported_count: number; skipped_count: number; error_count: number; warnings?: string[] }> {
  return apiClient.post<{ imported_count: number; skipped_count: number; error_count: number; warnings?: string[] }, FormData>(`/projects/${projectId}/import-parts-excel`, formData);
}

export async function getProjectExistingFiles(projectId: string): Promise<ProjectExistingFile[]> {
  return apiClient.get<ProjectExistingFile[]>(`/projects/${projectId}/files`);
}

export async function openProjectExistingFile(projectId: string, uploadedFileId: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }, Record<string, never>>(`/projects/${projectId}/files/${uploadedFileId}/open`, {});
}

export async function getProjectExistingFilePreview(projectId: string, uploadedFileId: string): Promise<ProjectExistingFilePreview> {
  return apiClient.get<ProjectExistingFilePreview>(`/projects/${projectId}/files/${uploadedFileId}/preview`);
}
