import { apiClient } from './client';

export interface CreateProjectInput {
  customer_name: string;
  project_name: string;
  template_name?: string;
}

export interface ProjectResponse {
  id: string;
  customer_name: string;
  project_name: string;
  template_name?: string;
  root_path?: string;
}

export async function getProjects(): Promise<ProjectResponse[]> {
  return apiClient.get<ProjectResponse[]>('/projects');
}

export async function createProject(data: CreateProjectInput): Promise<ProjectResponse> {
  return apiClient.post<ProjectResponse, CreateProjectInput>('/projects', data);
}
