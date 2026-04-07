export interface Project {
  id: string;
  customerName: string;
  projectName: string;
  template: string;
}

export interface Part {
  id: string;
  name: string;
}

export interface DocumentType {
  id: string;
  name: string;
}

export interface SlotData {
  hasFile: boolean;
  latestUploadDate: string;
}

export interface FileRecord {
  id: string;
  name: string;
  uploadDate: string;
  remarks: string;
}

export interface PendingFile {
  id: string;
  name: string;
}