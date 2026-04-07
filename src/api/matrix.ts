import { apiClient } from './client';

export interface MatrixPart {
  id: string;
  part_name: string;
}

export interface MatrixSlot {
  slot_id: string;
  part_id: string;
  document_type: string;
  group_type: 'external' | 'internal';
  has_file: boolean;
  latest_upload_at?: string;
}

export interface FileRecord {
  id: string;
  name: string;
  uploadDate?: string;
  remarks?: string;
}

export interface SlotDetail {
  slot_id: string;
  part_id: string;
  group_type: string;
  document_type: string;
  has_file: boolean;
  latest_filename?: string;
  latest_upload_at?: string;
  note?: string;
  target_folder_path?: string;
  target_folder_exists: boolean;
}

export interface StagingFile {
  filename: string;
  full_path: string;
  modified_at: string;
  size: number;
}

export interface ImportFromStagingRequest {
  staging_file_path: string;
  remark?: string;
}

export interface ImportLocalFileRequest {
  local_file_path: string;
  remark?: string;
}

export interface MatrixData {
  project: {
    id: string;
    customer_name: string;
    project_name: string;
    template_name?: string;
  };
  parts: MatrixPart[];
  document_types: string[];
  slots: MatrixSlot[];
}

export async function getProjectMatrix(projectId: string): Promise<MatrixData> {
  return apiClient.get<MatrixData>(`/projects/${projectId}/matrix`);
}

export async function getSlotDetail(slotId: string): Promise<SlotDetail> {
  return apiClient.get<SlotDetail>(`/document-slots/${slotId}`);
}

export async function openFolder(slotId: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }, {}>(`/document-slots/${slotId}/open-folder`, {});
}

export async function getStagingFiles(): Promise<StagingFile[]> {
  return apiClient.get<StagingFile[]>('/document-slots/staging-files');
}

export async function importFromStaging(slotId: string, request: ImportFromStagingRequest): Promise<{ message: string }> {
  return apiClient.post<{ message: string }, ImportFromStagingRequest>(`/document-slots/${slotId}/import-from-staging`, request);
}

export async function openLatestFile(slotId: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }, {}>(`/document-slots/${slotId}/open-latest-file`, {});
}

export async function uploadFile(slotId: string, file: File, remark?: string): Promise<{ message: string }> {
  const form = new FormData();
  form.append('file', file);
  if (remark) {
    form.append('remark', remark);
  }
  return apiClient.post<{ message: string }, FormData>(`/document-slots/${slotId}/upload-file`, form);
}

export async function getSlotFiles(slotId: string): Promise<FileRecord[]> {
  return apiClient.get<FileRecord[]>(`/document-slots/${slotId}/files`);
}
