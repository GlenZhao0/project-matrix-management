import { apiClient } from './client';

export interface SlotTemplateItemInput {
  group_type: 'external' | 'internal';
  slot_name: string;
  sort_order: number;
}

export interface SlotTemplateSummary {
  id: string;
  template_name: string;
  description?: string;
  recommended_part_type?: string;
  created_at: string;
}

export interface SlotTemplateItem extends SlotTemplateItemInput {
  id: string;
}

export interface SlotTemplateDetail extends SlotTemplateSummary {
  items: SlotTemplateItem[];
}

export interface SlotTemplateUpsertInput {
  template_name: string;
  description?: string;
  recommended_part_type?: string;
  items: SlotTemplateItemInput[];
}

export async function getSlotTemplateList(): Promise<SlotTemplateSummary[]> {
  return apiClient.get<SlotTemplateSummary[]>('/slot-templates');
}

export async function getSlotTemplateDetail(templateId: string): Promise<SlotTemplateDetail> {
  return apiClient.get<SlotTemplateDetail>(`/slot-templates/${templateId}`);
}

export async function createSlotTemplate(data: SlotTemplateUpsertInput): Promise<SlotTemplateDetail> {
  return apiClient.post<SlotTemplateDetail, SlotTemplateUpsertInput>('/slot-templates', data);
}

export async function updateSlotTemplate(templateId: string, data: SlotTemplateUpsertInput): Promise<SlotTemplateDetail> {
  return apiClient.request<SlotTemplateDetail>(`/slot-templates/${templateId}`, {
    method: 'PUT',
    body: data as any,
  });
}
