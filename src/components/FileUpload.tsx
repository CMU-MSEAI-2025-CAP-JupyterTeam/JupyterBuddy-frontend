import React from 'react';
import { UploadedFile } from '../types';
import { Upload, FileType, Database, File as FileIcon, X } from 'lucide-react';

interface FileUploadProps {
  files: UploadedFile[];
  onFilesAdded: (files: File[]) => void;
  onDescriptionChange: (id: string, description: string) => void;
  onRemoveFile: (id: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  files,
  onFilesAdded,
  onDescriptionChange,
  onRemoveFile,
}) => {
  const dropzoneRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    onFilesAdded(droppedFiles);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      onFilesAdded(selectedFiles);
    }
  };

  return (
    <div className="space-y-4">
      <div
        ref={dropzoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-700'
        }`}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Drag and drop files here, or{' '}
          <label className="text-blue-500 hover:text-blue-600 cursor-pointer">
            browse
            <input
              type="file"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </p>
      </div>

      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.id}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                {file.classification === 'dataset' ? (
                  <Database className="w-5 h-5 text-green-500" />
                ) : file.classification === 'context' ? (
                  <FileType className="w-5 h-5 text-blue-500" />
                ) : (
                  <FileIcon className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {file.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {file.classification === 'processing'
                      ? 'Analyzing file type...'
                      : `${file.classification} • ${(file.size / 1024).toFixed(1)} KB`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onRemoveFile(file.id)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {file.classification !== 'processing' && (
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Add a description (optional)"
                  value={file.description || ''}
                  onChange={(e) => onDescriptionChange(file.id, e.target.value)}
                  className="w-full px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-transparent"
                />
              </div>
            )}

            {file.status === 'uploading' && (
              <div className="mt-3">
                <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileUpload;