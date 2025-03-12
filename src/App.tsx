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

// Define the Action Result interface
interface ActionResult {
  action_type: string;
  result: any;
  success: boolean;
  error?: string;
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
        // Handle assistant messages
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.content }
        ]);
        setIsProcessing(false);
      } else if (data.type === 'system') {
        // Handle system messages
        setMessages(prev => [
          ...prev,
          { role: 'system', content: data.content }
        ]);
      } else if (data.type === 'action') {
        // Handle action requests from the LLM
        console.log('Received action request:', data.action);

        // Execute the action
        const actionResult = executeAction(data.action);

        // Send the action result back to the LLM
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              action_result: actionResult
            })
          );
        }
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
  }, []); // ([]) makes it run only once, when the component first mounts so the socket is only created once

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
        !input.trim() || // Empty input
        isProcessing || // Processing state
        !socket || // No WebSocket connection
        socket.readyState !== WebSocket.OPEN // WebSocket not ready
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

  // Execute actions requested by the LLM
  const executeAction = useCallback(
    (action: Action): ActionResult => {
      console.log('Executing action:', action.action_type);

      try {
        // Get the action type and payload
        const { action_type, payload } = action;

        // Handle different action types
        switch (action_type) {
          case 'CREATE_CELL':
            return handleCreateCellAction(payload);
          case 'UPDATE_CELL':
            return handleUpdateCellAction(payload);
          case 'EXECUTE_CELL':
            return handleExecuteCellAction(payload);
          case 'GET_NOTEBOOK_INFO':
            return handleGetNotebookInfoAction(payload);
          default:
            throw new Error(`Unknown action type: ${action_type}`);
        }
      } catch (error) {
        console.error('Error executing action:', error);

        // Return error result
        return {
          action_type: action.action_type,
          result: {},
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },
    [notebookTracker]
  );

  // Handle CREATE_CELL action
  const handleCreateCellAction = useCallback(
    (payload: any): ActionResult => {
      try {
        // Get cell type, content, and position from the payload
        const { cell_type, content, position } = payload;

        // Get the current notebook
        const notebookPanel = notebookTracker.currentWidget;

        // Check if a notebook is open
        if (!notebookPanel) {
          throw new Error('No active notebook found');
        }

        // Get the notebook content
        const notebook = notebookPanel.content;

        // Position to insert the cell
        let insertIndex = -1;

        // Insert a new cell at a specific position
        if (position === 'start') {
          // Insert at the beginning
          NotebookActions.insertAbove(notebook);
          insertIndex = 0;
        } else if (position === 'end' || position === undefined) {
          // Insert at the end
          const cellCount = notebook.model?.cells?.length || 0;
          if (cellCount > 0) {
            notebook.activeCellIndex = cellCount - 1;
          }
          NotebookActions.insertBelow(notebook);
          insertIndex = (notebook.model?.cells?.length || 1) - 1;
        } else if (typeof position === 'number') {
          // Insert at specific position
          const cellCount = notebook.model?.cells?.length || 0;
          // Set active cell index
          notebook.activeCellIndex = Math.min(
            position,
            Math.max(0, cellCount - 1)
          );
          NotebookActions.insertBelow(notebook);
          insertIndex = Math.min(position + 1, cellCount);
        } else if (position === 'after_active') {
          // Insert after active cell
          const activeIndex = notebook.activeCellIndex;
          NotebookActions.insertBelow(notebook);
          insertIndex = activeIndex + 1;
        } else if (position === 'before_active') {
          // Insert before active cell
          const activeIndex = notebook.activeCellIndex;
          NotebookActions.insertAbove(notebook);
          insertIndex = activeIndex;
        } else {
          // Default: insert below current cell
          NotebookActions.insertBelow(notebook);
          insertIndex = notebook.activeCellIndex + 1;
        }

        // Set cell type and content
        const activeCell = notebook.activeCell;
        if (activeCell) {
          // Change cell type if needed
          if (
            (cell_type === 'markdown' &&
              !(activeCell instanceof MarkdownCell)) ||
            (cell_type === 'code' && !(activeCell instanceof CodeCell))
          ) {
            NotebookActions.changeCellType(notebook, cell_type);
          }

          // Set content - using sharedModel.setSource
          if (activeCell.model && activeCell.model.sharedModel) {
            activeCell.model.sharedModel.setSource(content);
          }
        }

        // Get the updated notebook context
        const updatedContext = getNotebookContext();

        // Return success result
        return {
          action_type: 'CREATE_CELL',
          result: {
            cell_index: insertIndex,
            notebook_context: updatedContext
          },
          success: true
        };
      } catch (error) {
        console.error('Error creating cell:', error);
        return {
          action_type: 'CREATE_CELL',
          result: {},
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },
    [notebookTracker, getNotebookContext]
  );

  // Handle UPDATE_CELL action
  const handleUpdateCellAction = useCallback(
    (payload: any): ActionResult => {
      try {
        const { cell_index, content } = payload;

        // Get the current notebook
        const notebookPanel = notebookTracker.currentWidget;

        if (!notebookPanel) {
          throw new Error('No active notebook found');
        }

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
          throw new Error(`Invalid cell index: ${cell_index}`);
        }

        const cell = model.cells?.get(cell_index);
        if (cell && cell.sharedModel) {
          cell.sharedModel.setSource(content);

          // Return success result
          return {
            action_type: 'UPDATE_CELL',
            result: {
              cell_index,
              notebook_context: getNotebookContext()
            },
            success: true
          };
        } else {
          throw new Error(`Could not access cell at index ${cell_index}`);
        }
      } catch (error) {
        console.error('Error updating cell:', error);
        return {
          action_type: 'UPDATE_CELL',
          result: {},
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },
    [notebookTracker, getNotebookContext]
  );

  // Handle EXECUTE_CELL action
  const handleExecuteCellAction = useCallback(
    (payload: any): ActionResult => {
      try {
        const { cell_index } = payload;

        // Get the current notebook
        const notebookPanel = notebookTracker.currentWidget;

        if (!notebookPanel) {
          throw new Error('No active notebook found');
        }

        const notebook = notebookPanel.content;

        // Safely check cell index bounds
        const cellCount = notebook.model?.cells?.length || 0;
        if (
          cell_index !== undefined &&
          cell_index >= 0 &&
          cell_index < cellCount
        ) {
          notebook.activeCellIndex = cell_index;
        } else {
          throw new Error(`Invalid cell index: ${cell_index}`);
        }

        // Execute the active cell
        NotebookActions.run(notebook, notebookPanel.sessionContext);

        // Return success result
        return {
          action_type: 'EXECUTE_CELL',
          result: {
            cell_index,
            notebook_context: getNotebookContext()
          },
          success: true
        };
      } catch (error) {
        console.error('Error executing cell:', error);
        return {
          action_type: 'EXECUTE_CELL',
          result: {},
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },
    [notebookTracker, getNotebookContext]
  );

  // Handle GET_NOTEBOOK_INFO action
  const handleGetNotebookInfoAction = useCallback(
    (payload: any): ActionResult => {
      try {
        const { include_cell_content = true } = payload;

        // Get the notebook context
        const notebookContext = getNotebookContext();

        if (!notebookContext) {
          throw new Error('No active notebook found');
        }

        // If not including cell content, remove it
        let result = notebookContext;
        if (!include_cell_content && result.cells) {
          result = {
            ...result,
            cells: result.cells.map(cell => ({
              ...cell,
              content: ''
            }))
          };
        }

        // Return success result
        return {
          action_type: 'GET_NOTEBOOK_INFO',
          result: {
            notebook_context: result
          },
          success: true
        };
      } catch (error) {
        console.error('Error getting notebook info:', error);
        return {
          action_type: 'GET_NOTEBOOK_INFO',
          result: {},
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },
    [getNotebookContext]
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
