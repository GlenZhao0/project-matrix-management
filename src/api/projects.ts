import { apiClient } from './client';

export interface CreateProjectInput {
  customer_name: string;
  project_name: string;
  template_name?: string;
  project_template_id?: string;
}

export interface ProjectResponse {
  id: string;
  customer_name: string;
  project_name: string;
  template_name?: string;
  project_template_id?: string;
  default_slot_template_id?: string;
  default_slot_template_name?: string;
  root_path?: string;
  created_at: string;
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

export async function getProjects(): Promise<ProjectResponse[]> {
  return apiClient.get<ProjectResponse[]>('/projects');
}

export async function getProject(projectId: string): Promise<ProjectResponse> {
  return apiClient.get<ProjectResponse>(`/projects/${projectId}`);
}

export async function createProject(data: CreateProjectInput): Promise<ProjectResponse> {
  return apiClient.post<ProjectResponse, CreateProjectInput>('/projects', data);
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
