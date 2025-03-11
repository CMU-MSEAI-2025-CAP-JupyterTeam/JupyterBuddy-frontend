// src/App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
// JupyterFrontEnd is the main application class that is used to interact with the JupyterLab application
import { JupyterFrontEnd } from '@jupyterlab/application';
// INotebookTracker is a service that tracks notebook widgets.
// NotebookActions provides functions to interact with the notebook
import { INotebookTracker, NotebookActions } from '@jupyterlab/notebook';
// InputGroup and Button are UI components from JupyterLab
import { Button, InputGroup } from '@jupyterlab/ui-components';
// CodeCell and MarkdownCell are cell types from JupyterLab
import { CodeCell, MarkdownCell } from '@jupyterlab/cells';
import '../style/index.css';

// Define the Message interface
interface Message {
  role: 'user' | 'assistant' | 'system'; // human message, model response, system message (context/instructions)
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

// Define the App component
function App({ app, notebookTracker }: Props) {
  // Define the initial state
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Welcome to JupyterBuddy! How can I help you with your notebook?'
    }
  ]);
  const [input, setInput] = useState(''); // User input
  const [isProcessing, setIsProcessing] = useState(false); // Processing state
  const [socket, setSocket] = useState<WebSocket | null>(null); //  WebSocket connection
  const messagesEndRef = useRef<HTMLDivElement>(null); //  Ref for auto-scrolling

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize WebSocket connection
  useEffect(() => {
    const sessionId = `session-${Date.now()}`;
    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);

    // WebSocket event handlers
    // Handle the WebSocket connection
    ws.onopen = () => {
      console.log('WebSocket connection established');
    };

    // Handle incoming messages
    ws.onmessage = event => {
      const data = JSON.parse(event.data);

      if (data.type === 'assistant') {
        setMessages(prev => [
          // Add the assistant's message to the list
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
          // Add the system message to the list
          ...prev,
          { role: 'system', content: data.content }
        ]);
      }
    };

    // Handle WebSocket errors
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

    // Handle WebSocket connection close
    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    // Set the WebSocket connection
    setSocket(ws);

    // Cleanup function
    return () => {
      ws.close();
    };
  }, []); // ([]) makes it run only once, , when the component first mounts

  // Get current notebook context to send with message
  const getNotebookContext = useCallback(() => {
    // Get the current notebook
    const notebook = notebookTracker.currentWidget;
    if (!notebook) return null;

    // Get the notebook model
    const model = notebook.content.model;
    if (!model) return null;

    const cellsData = [];

    // Safely get the number of cells
    const cellCount = model.cells?.length || 0;

    // Collect information about cells
    for (let i = 0; i < cellCount; i++) {
      // Get the cell at index i
      const cell = model.cells?.get(i);
      // Collect cell data
      if (cell) {
        cellsData.push({
          index: i,
          type: cell.type,
          content: cell.sharedModel.getSource()
        });
      }
    }

    // Return the notebook context
    return {
      path: notebook.context.path, // Notebook path
      title: notebook.title.label, // Notebook title
      cells: cellsData, // Array of cell data
      activeCell: notebook.content.activeCellIndex // Index of the active cell
    };
  }, [notebookTracker]);

  // Send a message to the backend
  const sendMessage = useCallback(
    async (event: React.FormEvent) => {
      // Prevent the default form submission
      event.preventDefault();

      // Check if the input is empty or the WebSocket is not ready
      if (
        !input.trim() ||
        isProcessing ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      // Get the input content
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
    // Process each action
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
  }, []); // Empty dependency array to avoid re-creating the function

  // Create a new cell
  const createCell = useCallback(
    (payload: any) => {
      // Get cell type, content, and position from the payload
      const { cell_type, content, position } = payload;
      const notebookPanel = notebookTracker.currentWidget;
      if (!notebookPanel) return;

      // Get the notebook content
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
        // Safely check cell index bounds
        const cellCount = notebook.model?.cells?.length || 0;
        // Set active cell index
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
