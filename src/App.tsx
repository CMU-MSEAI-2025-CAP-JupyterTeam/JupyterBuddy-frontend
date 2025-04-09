//App.tsx
import '../style/index.css';
import React, { useState, useEffect, useCallback} from 'react';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { notebookHelpers } from './jupyterbuddyTools/notebookHelpers';
import Chat from './components/Chat';
import type { Message, UploadedFile} from './types';

// Import tools from jupyterbuddyTools
import { getToolsJSON, createToolExecutor} from './jupyterbuddyTools/tools';


interface Props {
  app: JupyterFrontEnd;
  notebookTracker: INotebookTracker;
}

function App({ app, notebookTracker }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'system-welcome',
      role: 'system',
      content: 'Welcome to JupyterBuddy! How can I help you with your notebook?',
      timestamp: new Date(),
    }
  ]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [waitingForAction, setWaitingForAction] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Create the tool executor function using the helper
  const executeToolAction = useCallback(
    createToolExecutor(notebookTracker),
    [notebookTracker]
  );

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
        
        console.log(`Executing tool: ${tool_name} with parameters:`, parameters);
        
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
                  results: [result],  // Always an array with a single result
                  notebook_context: null  // No need to send full context after each action
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
                content: 'Connection lost. Please refresh the page to reconnect.',
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
                  results: [{
                    action_type: tool_name,
                    result: {},
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                  }],
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
          content: 'Connection error. Please check if the backend server is running.',
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


  // ✅ This goes right after
  useEffect(() => {
    console.log('[Debug] Current uploaded files:', files);
  }, [files]);

// Handles sending a user message to the backend (LLM agent)
// Called from <Chat /> when the user submits input
const handleSendMessage = useCallback(
  (content: string) => {
    // Prevent sending if conditions are not ideal
    if (
      !content.trim() ||                  // Ignore empty messages
      isProcessing ||                    // Wait if already processing
      waitingForAction ||                // Wait if agent is executing a notebook action
      !socket ||                         // Ensure WebSocket is available
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
        id: Date.now().toString(),       // Unique ID (timestamp)
        role: 'user',
        content: content.trim(),
        timestamp: new Date()
      }
    ]);

    // Extract the notebook context (code, variables, etc.)
    const notebookContext = notebookHelpers.getNotebookContext(notebookTracker);

    // Log the size of the notebook context for debugging
    const contextPayloadString = JSON.stringify(notebookContext);
    console.log('notebookContext size (characters):', contextPayloadString.length);

    // Send the message and notebook context to the backend agent
    socket.send(
      JSON.stringify({
        type: 'user_message',
        data: content.trim(),            // The user’s message
        notebook_context: notebookContext
      })
    );
  },
  [isProcessing, waitingForAction, socket, notebookTracker]
);


  const handleFilesAdded = (newFiles: File[]) => {
    const processedFiles: UploadedFile[] = newFiles.map(file => ({
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      name: file.name,
      type: file.type,
      size: file.size,
      classification: 'processing',
      status: 'uploading',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...processedFiles]);

    // Simulate upload progress (we'll later replace this with real classification + backend call)
    processedFiles.forEach(file => {
      const timer = setInterval(() => {
        setFiles(prev =>
          prev.map(f => {
            if (f.id === file.id) {
              const progress = (f.progress || 0) + 20;
              if (progress >= 100) {
                clearInterval(timer);
                const isDataset = file.name.endsWith('.csv') || file.name.endsWith('.xlsx');
                return {
                  ...f,
                  progress: 100,
                  classification: isDataset ? 'dataset' : 'context',
                  status: 'ready',
                };
              }
              return { ...f, progress };
            }
            return f;
          })
        );
      }, 500);
    });

    // Add chat message announcing upload
    const fileNames = newFiles.map(f => f.name).join(', ');
    setMessages(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: `Uploaded: ${fileNames}`,
        timestamp: new Date(),
      },
    ]);
  };


  return (
    <Chat
  messages={messages}
  onSendMessage={handleSendMessage}
  onFilesAdded={handleFilesAdded}
  isProcessing={isProcessing}
/>
  );
}

export default App;