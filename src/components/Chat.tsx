import React from 'react';
import { Message, PendingFile } from '../types';
import MessageItem from './MessageItem';
import {
  SendHorizontal,
  Plus,
  X,
  Database,
  FileType,
  FileText
} from 'lucide-react';

const LONG_MESSAGE_THRESHOLD = 500; // Characters

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onFilesAdded: (files: File[]) => void;
  isProcessing: boolean;
}

const Chat: React.FC<ChatProps> = ({
  messages,
  onSendMessage,
  onFilesAdded,
  isProcessing
}) => {
  const [input, setInput] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || pendingFiles.length > 0) && !isProcessing) {
      if (pendingFiles.length > 0) {
        const files = pendingFiles.map(pf => {
          if (pf.content) {
            return new File([pf.content], pf.name, { type: 'text/plain' });
          }
          return pf.file;
        });
        onFilesAdded(files);
        setPendingFiles([]);
      }

      if (input.trim() && !pendingFiles.some(pf => pf.content === input)) {
        onSendMessage(input);
      }

      setInput('');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);

    // Check if the message is long enough to be converted to a file
    if (
      newValue.length >= LONG_MESSAGE_THRESHOLD &&
      !pendingFiles.some(pf => pf.content === newValue)
    ) {
      const timestamp = new Date().toISOString().split('T')[0];
      const newFile: PendingFile = {
        id: Date.now().toString() + Math.random(),
        name: `message-${timestamp}.txt`,
        type: 'text/plain',
        size: newValue.length,
        classification: 'context',
        status: 'ready',
        content: newValue,
        file: new File([newValue], `message-${timestamp}.txt`, {
          type: 'text/plain'
        })
      };
      setPendingFiles(prev => [...prev, newFile]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const newFiles = processFiles(Array.from(e.target.files));
      setPendingFiles(prev => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const classifyFile = (file: File): 'dataset' | 'context' => {
    const ext = file.name.toLowerCase().split('.').pop() || '';

    if (['csv', 'xls', 'xlsx', 'parquet'].includes(ext)) {
      return 'dataset';
    }

    if (['txt', 'md', 'markdown', 'pdf'].includes(ext)) {
      return 'context';
    }

    return 'context'; // default fallback
  };

  const processFiles = (files: File[]): PendingFile[] => {
    return files.map(file => ({
      id: Date.now().toString() + Math.random(),
      name: file.name,
      type: file.type,
      size: file.size,
      classification: classifyFile(file),
      status: 'ready',
      file: file,
      url: URL.createObjectURL(file) // 🧠 this is the local blob URL
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!chatContainerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      const newFiles = processFiles(Array.from(e.dataTransfer.files));
      setPendingFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isProcessing) {
        handleSubmit(e);
      }
    }
  };

  const removeFile = (id: string) => {
    setPendingFiles(prev => prev.filter(file => file.id !== id));
  };

  return (
    <div
      ref={chatContainerRef}
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
            <p className="text-lg font-medium">Drop files to upload</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {messages.map(message => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {pendingFiles.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map(file => (
              <div
                key={file.id}
                className="flex items-center space-x-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700"
              >
                {file.content ? (
                  <FileText className="w-4 h-4 text-purple-500" />
                ) : file.classification === 'dataset' ? (
                  <Database className="w-4 h-4 text-green-500" />
                ) : (
                  <FileType className="w-4 h-4 text-blue-500" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {file.name}
                </span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="Upload files"
          >
            <Plus className="w-5 h-5" />
          </button>
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingFiles.length > 0
                ? 'Add a message (optional) and press Enter to send files...'
                : 'Ask JB ...'
            }
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[44px] max-h-32"
            disabled={isProcessing}
            rows={1}
          />
          <button
            type="submit"
            disabled={
              (!input.trim() && pendingFiles.length === 0) || isProcessing
            }
            className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SendHorizontal className="w-5 h-5" />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </form>
    </div>
  );
};

export default Chat;
