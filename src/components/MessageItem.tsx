import React from 'react';
import ReactMarkdown from 'react-markdown';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Message } from '../types';
import { User, Bot } from 'lucide-react';

interface MessageItemProps {
  message: Message;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start space-x-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
          <Bot className="w-5 h-5 text-blue-600 dark:text-blue-300" />
        </div>
      )}
      
      <div className={`flex flex-col space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {isUser ? 'You' : 'JB'}
        </div>
        
        <div className={`max-w-2xl rounded-lg px-4 py-2 ${
          isUser 
            ? 'bg-blue-500 text-white' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        }`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({
                node,
                inline,
                className,
                children,
                ...props
              }: {
                node?: any;
                inline?: boolean;
                className?: string;
                children?: React.ReactNode;
              }) {
              
                const match = /language-(\w+)/.exec(className || '');

                const Syntax = SyntaxHighlighter as unknown as React.FC<any>;
                return !inline && match ? (
                  <Syntax
                    style={tomorrow}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </Syntax>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </div>
      )}
    </div>
  );
};

export default MessageItem;