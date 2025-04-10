//src/types.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  classification: 'dataset' | 'context' | 'processing';
  description?: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  progress?: number;
}
export interface PendingFile extends UploadedFile {
  file: File;
  content?: string;
  url?: string; // <-- Add this
}