// src/App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookActions } from '@jupyterlab/notebook';
import { Button, InputGroup } from '@jupyterlab/ui-components';
import { CodeCell, MarkdownCell } from '@jupyterlab/cells';
import '../style/index.css';

// Define the Message interface
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
// Define the Action interface
interface Action {
  action_type: string;
  payload: any;
}

// Define the Props interface for the App component
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
    };

    ws.onmessage = event => {
      const data = JSON.parse(event.data);

      if (data.type === 'assistant') {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.content }
        ]);
        setIsProcessing(false);

        // Handle any actions suggested by the assistant
        if (data.actions) {
          handleActions(data.actions);
        }
      } else if (data.type === 'system') {
        setMessages(prev => [
          ...prev,
          { role: 'system', content: data.content }
        ]);
      }
    };

    ws.onerror = error => {
      console.error('WebSocket error:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content:
            'Connection error. Please check if the backend server is running.'
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
  }, []);

  // Get current notebook context to send with message
  const getNotebookContext = useCallback(() => {
    const notebook = notebookTracker.currentWidget;
    if (!notebook) return null;

    const model = notebook.content.model;
    if (!model) return null;

    const cellsData = [];

    // Safely get the number of cells
    const cellCount = model.cells?.length || 0;

    // Collect information about cells
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

  // Send a message to the backend
  const sendMessage = useCallback(
    async (event: React.FormEvent) => {
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

      // Get current notebook context
      const notebookContext = getNotebookContext();

      // Send message with notebook context
      socket.send(
        JSON.stringify({
          content,
          notebook_context: notebookContext
        })
      );
    },
    [input, isProcessing, socket, getNotebookContext]
  );

  // Handle actions from the backend
  const handleActions = useCallback((actions: Action[]) => {
    actions.forEach(action => {
      switch (action.action_type) {
        case 'CREATE_CELL':
          createCell(action.payload);
          break;
        case 'EXECUTE_CELL':
          executeCell(action.payload);
          break;
        case 'UPDATE_CELL':
          updateCell(action.payload);
          break;
        default:
          console.warn('Unknown action type:', action.action_type);
      }
    });
  }, []);

  // Create a new cell
  const createCell = useCallback(
    (payload: any) => {
      const { cell_type, content, position } = payload;
      const notebookPanel = notebookTracker.currentWidget;
      if (!notebookPanel) return;

      const notebook = notebookPanel.content;

      // Insert a new cell at a specific position
      if (position === 'start') {
        // Insert at the beginning
        NotebookActions.insertAbove(notebook);
      } else if (position === 'end' || position === undefined) {
        // Insert at the end
        // Safely access cells.length
        const cellCount = notebook.model?.cells?.length || 0;
        if (cellCount > 0) {
          notebook.activeCellIndex = cellCount - 1;
        }
        NotebookActions.insertBelow(notebook);
      } else if (typeof position === 'number') {
        // Insert at specific position
        const cellCount = notebook.model?.cells?.length || 0;
        notebook.activeCellIndex = Math.min(
          position,
          Math.max(0, cellCount - 1)
        );
        NotebookActions.insertBelow(notebook);
      } else {
        // Default: insert below current cell
        NotebookActions.insertBelow(notebook);
      }

      // Set cell type and content
      const activeCell = notebook.activeCell;
      if (activeCell) {
        // Change cell type if needed
        if (
          (cell_type === 'markdown' && !(activeCell instanceof MarkdownCell)) ||
          (cell_type === 'code' && !(activeCell instanceof CodeCell))
        ) {
          NotebookActions.changeCellType(notebook, cell_type);
        }

        // Set content - using sharedModel.setSource
        if (activeCell.model && activeCell.model.sharedModel) {
          activeCell.model.sharedModel.setSource(content);
        }
      }
    },
    [notebookTracker]
  );

  // Execute a cell
  const executeCell = useCallback(
    (payload: any) => {
      const { cell_index } = payload;
      const notebookPanel = notebookTracker.currentWidget;

      if (!notebookPanel) return;

      const notebook = notebookPanel.content;

      // Safely check cell index bounds
      const cellCount = notebook.model?.cells?.length || 0;
      if (
        cell_index !== undefined &&
        cell_index >= 0 &&
        cell_index < cellCount
      ) {
        notebook.activeCellIndex = cell_index;
      }

      // Execute the active cell
      NotebookActions.run(notebook, notebookPanel.sessionContext);
    },
    [notebookTracker]
  );

  // Update a cell's content
  const updateCell = useCallback(
    (payload: any) => {
      const { cell_index, content } = payload;
      const notebookPanel = notebookTracker.currentWidget;

      if (!notebookPanel) return;

      const notebook = notebookPanel.content;
      const model = notebook.model;

      // Safely check cell index bounds
      const cellCount = model?.cells?.length || 0;
      if (
        !model ||
        cell_index === undefined ||
        cell_index < 0 ||
        cell_index >= cellCount
      ) {
        return;
      }

      const cell = model.cells?.get(cell_index);
      if (cell && cell.sharedModel) {
        cell.sharedModel.setSource(content);
      }
    },
    [notebookTracker]
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
