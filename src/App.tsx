//App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { notebookHelpers } from './jupyterbuddyTools/notebookHelpers';
import Chat from './components/Chat';
import { Bot, Sun, Moon } from 'lucide-react';
import type { Message } from './types';

import '../style/index.css';

// Import tools from jupyterbuddyTools
import { getToolsJSON, createToolExecutor } from './jupyterbuddyTools/tools';

interface Props {
  app: JupyterFrontEnd;
  notebookTracker: INotebookTracker;
}

function App({ app, notebookTracker }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'system-welcome',
      role: 'system',
      content:
        "👋 Hi! I'm JB, your machine learning and data workflow assistant. How can I be of help?",
      timestamp: new Date()
    }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [waitingForAction, setWaitingForAction] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Create the tool executor function using the helper
  const executeToolAction = useCallback(createToolExecutor(notebookTracker), [
    notebookTracker
  ]);

  // Dark mode ci=ontrol
  const [isDark, setIsDark] = React.useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    
    // Update DOM and localStorage
    const root = document.documentElement;
    if (newTheme) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };
  

  // Initialize WebSocket connection
  useEffect(() => {
    const sessionId = `session-${Date.now()}`;
    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);

    ws.onopen = () => {
      console.log('WebSocket connection established');
      const toolsPayload = {
        type: 'register_tools',
        data: getToolsJSON()
      };

      // Log size
      const toolsPayloadString = JSON.stringify(toolsPayload);
      console.log('Payload size (characters):', toolsPayloadString.length);
      console.log('Sending tool definitions:', toolsPayload);

      // Send payload
      ws.send(JSON.stringify(toolsPayload));
    };

    ws.onmessage = async event => {
      const data = JSON.parse(event.data);

      // Handle simple text messages
      if (data.message && !data.actions) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: data.message,
            timestamp: new Date()
          }
        ]);

        setIsProcessing(false);
      }
      // Handle actions from the LLM
      else if (data.actions && data.actions.length > 0) {
        console.log('Received actions from LLM:', data.actions);

        // If there's a message along with actions, display it
        if (data.message) {
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: data.message,
              timestamp: new Date()
            }
          ]);
        }

        // Process only the first action (backend only processes one at a time)
        const action = data.actions[0];
        const { tool_name, parameters } = action;

        console.log(
          `Executing tool: ${tool_name} with parameters:`,
          parameters
        );

        // Set state to indicate we're waiting for an action to complete
        setWaitingForAction(true);

        // Execute the single action
        try {
          const result = await executeToolAction(tool_name, parameters);
          console.log(`Tool execution result:`, result);

          // Send back only the single result
          if (ws.readyState === WebSocket.OPEN) {
            console.log('Sending action result back to backend:', result);
            ws.send(
              JSON.stringify({
                type: 'action_result',
                data: {
                  results: [result], // Always an array with a single result
                  notebook_context: null // No need to send full context after each action
                }
              })
            );
          } else {
            console.error('WebSocket not open, cannot send results');
            // If WebSocket is closed, show error and reset state
            setMessages(prev => [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'system',
                content:
                  'Connection lost. Please refresh the page to reconnect.',
                timestamp: new Date()
              }
            ]);
            setWaitingForAction(false);
            setIsProcessing(false);
          }
        } catch (error) {
          console.error('Error executing tool action:', error);

          // Send back error result
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'action_result',
                data: {
                  results: [
                    {
                      action_type: tool_name,
                      result: {},
                      success: false,
                      error:
                        error instanceof Error ? error.message : 'Unknown error'
                    }
                  ],
                  notebook_context: null
                }
              })
            );
          }

          // Show error to user
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              content: `Error executing operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
              timestamp: new Date()
            }
          ]);
        } finally {
          // Reset action waiting state after sending result
          setWaitingForAction(false);
        }
      }
    };

    ws.onerror = error => {
      console.error('WebSocket error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'system',
          content:
            'Connection error. Please check if the backend server is running.',
          timestamp: new Date()
        }
      ]);

      setIsProcessing(false);
      setWaitingForAction(false);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      // If there's an ongoing action when connection closes, reset state
      if (isProcessing || waitingForAction) {
        setIsProcessing(false);
        setWaitingForAction(false);
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'system',
            content: 'Connection closed. Please refresh the page to reconnect.',
            timestamp: new Date()
          }
        ]);
      }
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [executeToolAction]);

  // Handles sending a user message to the backend (LLM agent)
  // Called from <Chat /> when the user submits input
  const handleSendMessage = useCallback(
    (content: string) => {
      // Prevent sending if conditions are not ideal
      if (
        !content.trim() || // Ignore empty messages
        isProcessing || // Wait if already processing
        waitingForAction || // Wait if agent is executing a notebook action
        !socket || // Ensure WebSocket is available
        socket.readyState !== WebSocket.OPEN // Ensure WebSocket is open
      ) {
        return;
      }

      // Mark as processing so UI can show loading state
      setIsProcessing(true);

      // Immediately show the user's message in the chat UI
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(), // Unique ID (timestamp)
          role: 'user',
          content: content.trim(),
          timestamp: new Date()
        }
      ]);

      // Extract the notebook context (code, variables, etc.)
      const notebookContext =
        notebookHelpers.getNotebookContext(notebookTracker);

      // Log the size of the notebook context for debugging
      const contextPayloadString = JSON.stringify(notebookContext);
      console.log(
        'notebookContext size (characters):',
        contextPayloadString.length
      );

      // Send the message and notebook context to the backend agent
      socket.send(
        JSON.stringify({
          type: 'user_message',
          data: content.trim(), // The user’s message
          notebook_context: notebookContext
        })
      );
    },
    [isProcessing, waitingForAction, socket, notebookTracker]
  );

  const handleFilesAdded = (files: File[]) => {
    console.log('Files added (not yet handled):', files);
  };

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="h-full flex flex-col">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <h1 className="text-xl font-semibold">JupyterBuddy</h1>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Toggle dark mode"
            >
              {isDark ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <Chat
              messages={messages}
              onSendMessage={handleSendMessage}
              onFilesAdded={handleFilesAdded}
              isProcessing={isProcessing}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
