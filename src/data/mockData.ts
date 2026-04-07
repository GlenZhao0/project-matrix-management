import { Project, Part, DocumentType, SlotData, FileRecord, PendingFile } from '../types';

export const mockProjects: Project[] = [
  {
    id: '1',
    customerName: '客户A',
    projectName: '项目1',
    template: '模板1',
  },
  {
    id: '2',
    customerName: '客户B',
    projectName: '项目2',
    template: '模板2',
  },
];

export const mockParts: Part[] = [
  { id: '1', name: 'Part A' },
  { id: '2', name: 'Part B' },
  { id: '3', name: 'Part C' },
];

export const mockDocumentTypes: DocumentType[] = [
  { id: 'cbd', name: 'CBD' },
  { id: 'fai', name: 'FAI' },
  { id: 'cpk', name: 'CPK' },
  { id: 'dfm', name: 'DFM' },
  { id: 'dwg', name: 'DWG' },
];

export const mockSlotData: Record<string, Record<string, SlotData>> = {
  '1': {
    'cbd': { hasFile: true, latestUploadDate: '2023-10-01' },
    'fai': { hasFile: false, latestUploadDate: '' },
    'cpk': { hasFile: true, latestUploadDate: '2023-09-15' },
    'dfm': { hasFile: false, latestUploadDate: '' },
    'dwg': { hasFile: true, latestUploadDate: '2023-08-20' },
  },
  '2': {
    'cbd': { hasFile: false, latestUploadDate: '' },
    'fai': { hasFile: true, latestUploadDate: '2023-11-05' },
    'cpk': { hasFile: false, latestUploadDate: '' },
    'dfm': { hasFile: true, latestUploadDate: '2023-07-30' },
    'dwg': { hasFile: false, latestUploadDate: '' },
  },
  '3': {
    'cbd': { hasFile: true, latestUploadDate: '2023-12-01' },
    'fai': { hasFile: true, latestUploadDate: '2023-11-20' },
    'cpk': { hasFile: false, latestUploadDate: '' },
    'dfm': { hasFile: false, latestUploadDate: '' },
    'dwg': { hasFile: true, latestUploadDate: '2023-10-10' },
  },
};

export const mockPendingFiles: PendingFile[] = [
  { id: '1', name: 'file1.pdf' },
  { id: '2', name: 'file2.docx' },
  { id: '3', name: 'file3.xlsx' },
];

export const mockHistoryFiles: FileRecord[] = [
  { id: '1', name: 'old_file1.pdf', uploadDate: '2023-09-01', remarks: '初始版本' },
  { id: '2', name: 'old_file2.docx', uploadDate: '2023-08-15', remarks: '更新内容' },
  { id: '3', name: 'old_file3.xlsx', uploadDate: '2023-07-20', remarks: '修正错误' },
];