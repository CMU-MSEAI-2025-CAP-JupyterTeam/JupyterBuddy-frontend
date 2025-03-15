import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Button, InputGroup } from '@jupyterlab/ui-components';
import '../style/index.css';

// Import tools from jupyterbuddyTools
import { getToolsJSON, toolFunctions } from './jupyterbuddyTools/tools';

// Define interfaces
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Props {
  app: JupyterFrontEnd;
  notebookTracker: INotebookTracker;
}

function App({ app, notebookTracker }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Welcome to JupyterBuddy! How can I help you with your notebook?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get current notebook context
  const getNotebookContext = useCallback(() => {
    const notebook = notebookTracker.currentWidget;
    if (!notebook) return null;

    const model = notebook.content.model;
    if (!model) return null;

    const cellsData = [];
    const cellCount = model.cells?.length || 0;

    for (let i = 0; i < cellCount; i++) {
      const cell = model.cells?.get(i);
      if (cell) {
        cellsData.push({
          index: i,
          type: cell.type,
          content: cell.sharedModel.getSource()
        });
      }
    }

    return {
      path: notebook.context.path,
      title: notebook.title.label,
      cells: cellsData,
      activeCell: notebook.content.activeCellIndex
    };
  }, [notebookTracker]);

  // Execute a tool action
  const executeToolAction = useCallback((toolName: string, parameters: any) => {
    switch (toolName) {
      case 'create_cell':
        return toolFunctions.create_cell(parameters, notebookTracker, getNotebookContext);
      case 'update_cell':
        return toolFunctions.update_cell(parameters, notebookTracker, getNotebookContext);
      case 'execute_cell':
        return toolFunctions.execute_cell(parameters, notebookTracker, getNotebookContext);
      case 'get_notebook_info':
        return toolFunctions.get_notebook_info(parameters, notebookTracker, getNotebookContext);
      default:
        return {
          action_type: toolName,
          result: {},
          success: false,
          error: `Unknown tool: ${toolName}`
        };
    }
  }, [notebookTracker, getNotebookContext]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize WebSocket connection
  useEffect(() => {
    const sessionId = `session-${Date.now()}`;
    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);

    ws.onopen = () => {
      console.log('WebSocket connection established');
      
      // Send tool definitions to backend on connection establishment
      ws.send(
        JSON.stringify({
          type: "register_tools",
          data: getToolsJSON()
        })
      );
    };

    ws.onmessage = event => {
      const data = JSON.parse(event.data);

      if (data.message) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.message }
        ]);
        setIsProcessing(false);
      } else if (data.actions) {
        console.log('Received actions from LLM:', data.actions);
        
        if (data.message) {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: data.message }
          ]);
        }

        const actionResults = data.actions.map((action: any) => {
          const { tool_name, parameters } = action;
          return executeToolAction(tool_name, parameters);
        });

        const updatedContext = getNotebookContext();

        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "action_result",
              data: {
                results: actionResults,
                notebook_context: updatedContext
              }
            })
          );
        }
      }
    };

    ws.onerror = error => {
      console.error('WebSocket error:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: 'Connection error. Please check if the backend server is running.'
        }
      ]);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [getNotebookContext, executeToolAction]);

  // Send a message to the backend
  const sendMessage = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();

      if (
        !input.trim() ||
        isProcessing ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      const content = input.trim();
      setInput('');
      setIsProcessing(true);
      setMessages(prev => [...prev, { role: 'user', content }]);

      const notebookContext = getNotebookContext();

      socket.send(
        JSON.stringify({
          type: "user_message",
          data: content,
          notebook_context: notebookContext
        })
      );
    },
    [input, isProcessing, socket, getNotebookContext]
  );

  return (
    <div className="jp-JupyterBuddy-container">
      <div className="jp-JupyterBuddy-chatMessages">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`jp-JupyterBuddy-message jp-JupyterBuddy-${msg.role}`}
          >
            <div className="jp-JupyterBuddy-messageRole">
              {msg.role === 'user'
                ? 'You'
                : msg.role === 'assistant'
                  ? 'Assistant'
                  : 'System'}
            </div>
            <div className="jp-JupyterBuddy-messageContent">{msg.content}</div>
          </div>
        ))}
        {isProcessing && (
          <div className="jp-JupyterBuddy-message jp-JupyterBuddy-assistant">
            <div className="jp-JupyterBuddy-messageRole">Assistant</div>
            <div className="jp-JupyterBuddy-messageContent">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="jp-JupyterBuddy-inputForm">
        <InputGroup
          type="text"
          placeholder="Ask a question about your notebook..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isProcessing}
          className="jp-JupyterBuddy-input"
        />
        <Button type="submit" disabled={isProcessing || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

export default App;