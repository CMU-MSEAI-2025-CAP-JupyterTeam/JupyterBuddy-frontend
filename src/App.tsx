import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Button, InputGroup } from '@jupyterlab/ui-components';
import { notebookHelpers } from './jupyterbuddyTools/notebookHelpers';
import '../style/index.css';

// Import tools from jupyterbuddyTools
import { getToolsJSON, createToolExecutor} from './jupyterbuddyTools/tools';

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
  const [waitingForAction, setWaitingForAction] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create the tool executor function using the helper
  const executeToolAction = useCallback(
    createToolExecutor(notebookTracker),
    [notebookTracker]
  );

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

    ws.onmessage = event => {
      const data = JSON.parse(event.data);

      // Handle simple text messages
      if (data.message && !data.actions) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.message }
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
            { role: 'assistant', content: data.message }
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
          const result = executeToolAction(tool_name, parameters);
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
                role: 'system',
                content: 'Connection lost. Please refresh the page to reconnect.'
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
              role: 'system',
              content: `Error executing operation: ${error instanceof Error ? error.message : 'Unknown error'}`
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
          role: 'system',
          content:
            'Connection error. Please check if the backend server is running.'
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
            role: 'system',
            content: 'Connection closed. Please refresh the page to reconnect.'
          }
        ]);
      }
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [executeToolAction]);

  // Send a message to the backend
  const sendMessage = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();

      // Don't send if input is empty, already processing, or WebSocket is not ready
      if (
        !input.trim() ||
        isProcessing ||
        waitingForAction ||  // Add check for waitingForAction
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      const content = input.trim();
      setInput('');
      setIsProcessing(true);
      setMessages(prev => [...prev, { role: 'user', content }]);

      // Get full notebook context for user message
      const notebookContext = notebookHelpers.getNotebookContext(notebookTracker);

      // Log notebookContext size
      const contextPayloadString = JSON.stringify(notebookContext);
      console.log('notebookContext size (characters):', contextPayloadString.length);

      socket.send(
        JSON.stringify({
          type: 'user_message',
          data: content,
          notebook_context: notebookContext
        })
      );
    },
    [input, isProcessing, waitingForAction, socket, notebookTracker]
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
        {waitingForAction && (
          <div className="jp-JupyterBuddy-message jp-JupyterBuddy-system">
            <div className="jp-JupyterBuddy-messageRole">System</div>
            <div className="jp-JupyterBuddy-messageContent">Executing notebook operation...</div>
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
          disabled={isProcessing || waitingForAction}
          className="jp-JupyterBuddy-input"
        />
        <Button 
          type="submit" 
          disabled={isProcessing || waitingForAction || !input.trim()}
        >
          Send
        </Button>
      </form>
    </div>
  );
}

export default App;