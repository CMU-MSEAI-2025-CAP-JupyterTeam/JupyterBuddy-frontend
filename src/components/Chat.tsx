//src/components/Chat.tsx
import React from 'react';
import { Message, PendingFile } from '../types';
import MessageItem from './MessageItem';
import { saveDatasetToNotebook } from '../jupyterbuddyTools/notebookHelpers';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { buildContextPayload } from '../utilities/fileUtilities';

import {
  SendHorizontal,
  Plus,
  X,
  Database,
  FileType,
  FileText,
  Loader
} from 'lucide-react';

const LONG_MESSAGE_THRESHOLD = 500; // Characters

interface ChatProps {
  app: JupyterFrontEnd;
  messages: Message[];
  onSendMessage: (content: string, context?: any[]) => void;
  isProcessing: boolean;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>; //
  updateMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const Chat: React.FC<ChatProps> = ({
  app,
  messages,
  onSendMessage,
  isProcessing,
  setIsProcessing,
  updateMessages
}) => {
  const [input, setInput] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]);

  // new hooks
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const instructionsFileRef = React.useRef<HTMLInputElement>(null);
  const datasetFileRef = React.useRef<HTMLInputElement>(null);
  const [showMenu, setShowMenu] = React.useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() && pendingFiles.length === 0) return;

    if ((input.trim() || pendingFiles.length > 0) && !isProcessing) {
      setIsProcessing(true); // block double-submits

      const uploadedPaths: string[] = []; // dataset paths for notebook tools
      const contextFiles: File[] = []; // files for RAG context

      // Step 1: Process pending files based on classification
      if (pendingFiles.length > 0) {
        for (const pf of pendingFiles) {
          const file = pf.content
            ? new File([pf.content], pf.name, { type: 'text/plain' })
            : pf.file;

          if (pf.classification === 'dataset') {
            try {
              const savedPath = await saveDatasetToNotebook(app, file);
              uploadedPaths.push(savedPath);
            } catch (err) {
              console.error(`[❌ Save Failed] ${file.name}`, err);
            }
          } else if (pf.classification === 'context') {
            contextFiles.push(file);
          }
        }

        setPendingFiles([]); // Clear file buffer after processing
      }

      // Step 2: Build final user message
      let finalMessage = input.trim();

      if (uploadedPaths.length > 0) {
        finalMessage +=
          (finalMessage ? '\n\n' : '') +
          `Uploaded file locations: ${uploadedPaths.join(', ')}\n\n`;
      }

      // Step 3: Build RAG context payload only if needed
      const contextPayload =
        contextFiles.length > 0
          ? await buildContextPayload(contextFiles)
          : undefined;

      // Step 4: Send to backend
      console.log("📦 RAG Context Payload:", contextPayload);
      onSendMessage(finalMessage, contextPayload);

      // Step 5: Reset input
      setInput('');
    }
  };

  // Handle input change and check for long messages
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);

    // Check if the input length exceeds the threshold
    if (newValue.length >= LONG_MESSAGE_THRESHOLD) {
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

      // Show system message for transparency
      setPendingFiles(prev => [...prev, newFile]);
      setInput('');
    }
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'dataset' | 'context'
  ) => {
    if (e.target.files?.length) {
      const newFiles = processFiles(Array.from(e.target.files), type);
      setPendingFiles(prev => [...prev, ...newFiles]);
      e.target.value = '';
      setShowMenu(false);
    }
  };

  const processFiles = (
    files: File[],
    type: 'dataset' | 'context'
  ): PendingFile[] => {
    return files.map(file => ({
      id: Date.now().toString() + Math.random(),
      name: file.name,
      type: file.type,
      size: file.size,
      classification: type,
      status: 'ready',
      file: file,
      url: URL.createObjectURL(file)
    }));
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
    <div className="flex flex-col h-full relative ">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 ">
        {messages.map(message => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Files */}
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

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center space-x-2">
          {/* ➕ Upload Dropdown */}
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={e => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="Upload files"
            >
              {showMenu ? (
                <X className="w-5 h-5 text-red-500" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>

            {showMenu && (
              <div className="absolute bottom-full mb-2 left-0 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                <button
                  onClick={() => instructionsFileRef.current?.click()}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                >
                  <FileText className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Instructions
                  </span>
                </button>
                <button
                  onClick={() => datasetFileRef.current?.click()}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left border-t border-gray-200 dark:border-gray-700"
                >
                  <Database className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Dataset
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* 💬 Message Input */}
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingFiles.length > 0
                ? 'Add a message ... '
                : 'Ask JB anything...'
            }
            className="flex-1 px-4 py-[11px] rounded-lg border border-gray-300 dark:border-gray-600 
            bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 
            focus:ring-blue-500 resize-none min-h-[44px] max-h-32 leading-[1.4]"
            disabled={isProcessing}
            rows={1}
          />

          {/* Submit */}
          {isProcessing ? (
            <div className="p-2 rounded-lg bg-blue-500 text-white">
              <Loader className="w-5 h-5 animate-spin text-white" />
            </div>
          ) : (
            <button
              type="submit"
              disabled={
                (!input.trim() && pendingFiles.length === 0) ||
                pendingFiles.some(f => f.status !== 'ready')
              }
              className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SendHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      </form>

      {/* Hidden File Inputs */}
      <input
        ref={instructionsFileRef}
        type="file"
        multiple
        onChange={e => handleFileSelect(e, 'context')}
        className="hidden"
        accept=".txt,.md,.py,.ipynb,.json,.yaml,.yml,.pdf,.docx,.doc"
      />
      <input
        ref={datasetFileRef}
        type="file"
        multiple
        onChange={e => handleFileSelect(e, 'dataset')}
        className="hidden"
        accept=".csv,.xlsx,.xls,.json,.parquet"
      />
    </div>
  );
};

export default Chat;
