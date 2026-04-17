import { apiClient } from './client';

export interface DirectoryPathResponse {
  path: string;
}

export interface SystemPathValidation {
  path: string;
  exists: boolean;
  is_directory: boolean;
  writable: boolean;
  can_create: boolean;
  message: string;
}

export interface SystemPathSettings {
  project_root: string;
  import_root: string;
  export_root: string;
  theme: 'light' | 'dark' | 'system';
  validations: Record<'project_root' | 'import_root' | 'export_root', SystemPathValidation>;
  updated_at?: string | null;
}

export interface SystemPathSettingsInput {
  project_root: string;
  import_root: string;
  export_root: string;
  theme: 'light' | 'dark' | 'system';
}

export async function getSystemSettings(): Promise<SystemPathSettings> {
  return apiClient.get<SystemPathSettings>('/system/settings');
}

export async function updateSystemSettings(data: SystemPathSettingsInput): Promise<SystemPathSettings> {
  return apiClient.request<SystemPathSettings>('/system/settings', {
    method: 'PUT',
    body: data as any,
  });
}

export async function validateSystemSettings(data: SystemPathSettingsInput): Promise<SystemPathSettings> {
  return apiClient.post<SystemPathSettings, SystemPathSettingsInput>('/system/settings/validate', data);
}

export async function getExportRoot(): Promise<DirectoryPathResponse> {
  const settings = await getSystemSettings();
  return { path: settings.export_root };
}

export async function setExportRoot(path: string): Promise<DirectoryPathResponse> {
  const settings = await getSystemSettings();
  const updated = await updateSystemSettings({
    project_root: settings.project_root,
    import_root: settings.import_root,
    export_root: path,
    theme: settings.theme,
  });
  return { path: updated.export_root };
}

export async function selectDirectory(
  title?: string,
  initialPath?: string,
): Promise<string> {
  const response = await apiClient.post<DirectoryPathResponse, { title?: string; initial_path?: string }>(
    '/system/select-directory',
    {
      title,
      initial_path: initialPath,
    },
  );
  return response.path;
}
