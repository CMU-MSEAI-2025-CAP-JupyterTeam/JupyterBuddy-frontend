// tools.ts
// This file defines the available tools for JupyterBuddy and their implementations
// It serves as a single source of truth for tool definitions and functions

import { NotebookActions } from '@jupyterlab/notebook';
import { INotebookTracker } from '@jupyterlab/notebook';
import { notebookHelpers } from './notebookHelpers';

// Updated interfaces to match OpenAI format
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[] | number[];
}

export interface Tool {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: {
        [key: string]: ToolParameter;
      };
      required: string[];
    };
  };
}

export interface ActionResult {
  action_type: string;
  result: Record<string, any>;
  success: boolean;
  error?: string;
}

// Enhanced notebook context to include more state information
export interface NotebookContext {
  path: string;
  title: string;
  cells: Array<{
    index: number;
    type: string;
    content: string;
    execution_count?: number | null;
    outputs?: Array<any>;
    is_active?: boolean;
  }>;
  activeCell: number;
  isEmpty: boolean;
  hasActiveCell: boolean;
  totalCells: number;
}

// Payload interfaces
export interface CreateCellPayload {
  cell_type: 'code' | 'markdown';
  content: string;
  position?: 'start' | 'end' | 'before_active' | 'after_active' | number;
}

export interface UpdateCellPayload {
  cell_index: number;
  content: string;
}

export interface ExecuteCellPayload {
  cell_index: number;
}

export interface DeleteCellPayload {
  cell_index: number;
}

export interface GetNotebookInfoPayload {
  include_cell_content?: boolean;
  include_outputs?: boolean;
}

export interface SetActiveCellPayload {
  cell_index: number;
}

// Type for getNotebookContext function
export type GetNotebookContextFn = () => NotebookContext | null;

// The tools available to JupyterBuddy - in OpenAI format
export const jupyterBuddyTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "create_cell",
      description: "Creates a new cell in the notebook at the specified position.",
      parameters: {
        type: "object",
        properties: {
          cell_type: {
            type: "string",
            description: "The type of cell to create (code or markdown).",
            enum: ["code", "markdown"]
          },
          content: {
            type: "string", 
            description: "The content to place in the cell."
          },
          position: {
            type: "string",
            description: "Where to create the cell. Can be 'start', 'end', 'before_active', 'after_active', or a numeric index. Defaults to 'after_active'.",
            enum: ["start", "end", "before_active", "after_active"]
          }
        },
        required: ["cell_type", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_cell",
      description: "Updates the content of an existing cell in the notebook.",
      parameters: {
        type: "object",
        properties: {
          cell_index: {
            type: "integer",
            description: "The index of the cell to update (0-based)."
          },
          content: {
            type: "string",
            description: "The new content for the cell."
          }
        },
        required: ["cell_index", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_cell",
      description: "Executes a specific cell in the notebook.",
      parameters: {
        type: "object",
        properties: {
          cell_index: {
            type: "integer",
            description: "The index of the cell to execute (0-based)."
          }
        },
        required: ["cell_index"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_cell",
      description: "Deletes a cell by index.",
      parameters: {
        type: "object",
        properties: {
          cell_index: {
            type: "integer",
            description: "The index of the cell to delete (0-based)."
          }
        },
        required: ["cell_index"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_active_cell",
      description: "Sets the active cell in the notebook.",
      parameters: {
        type: "object",
        properties: {
          cell_index: {
            type: "integer",
            description: "The index of the cell to make active (0-based)."
          }
        },
        required: ["cell_index"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_notebook_info",
      description: "Gets comprehensive information about the current notebook structure and content.",
      parameters: {
        type: "object",
        properties: {
          include_cell_content: {
            type: "boolean",
            description: "Whether to include the content of each cell in the response. Defaults to true."
          },
          include_outputs: {
            type: "boolean",
            description: "Whether to include code cell outputs in the response. Defaults to true."
          }
        },
        required: []
      }
    }
  }
];

// Function to get tools as JSON for sending to backend
export function getToolsJSON(): string {
  return JSON.stringify(jupyterBuddyTools);
}

// Tool implementation functions
export const toolFunctions = {
  // CREATE_CELL implementation
  create_cell: (payload: CreateCellPayload, notebookTracker: INotebookTracker, getNotebookContext: GetNotebookContextFn): ActionResult => {
    try {
      // Get cell type, content, and position from the payload
      const { cell_type, content, position } = payload;

      // Convert position format
      let positionType: string;
      let targetIndex: number | undefined;
      
      if (position === 'start') positionType = 'atStart';
      else if (position === 'end') positionType = 'atEnd';
      else if (position === 'before_active') positionType = 'aboveActive';
      else if (position === 'after_active' || position === undefined) positionType = 'belowActive';
      else if (typeof position === 'number') {
        positionType = 'atIndex';
        targetIndex = position;
      } else {
        positionType = 'belowActive'; // Default
      }

      // Use notebook helpers to get notebook and insert cell
      const { notebook } = notebookHelpers.getNotebook(notebookTracker);
      const newIndex = notebookHelpers.insertCellAtPosition(notebook, positionType, targetIndex);

      // Set cell type
      if (cell_type === 'markdown') {
        NotebookActions.changeCellType(notebook, 'markdown');
      }

      // Set content
      const cell = notebook.activeCell;
      if (cell && cell.model && cell.model.sharedModel) {
        cell.model.sharedModel.setSource(content);
      }

      // Get updated notebook context
      const updatedContext = getNotebookContext();

      // Return success result
      return {
        action_type: 'CREATE_CELL',
        result: {
          cell_index: newIndex,
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

  // UPDATE_CELL implementation
  update_cell: (payload: UpdateCellPayload, notebookTracker: INotebookTracker, getNotebookContext: GetNotebookContextFn): ActionResult => {
    try {
      const { cell_index, content } = payload;

      // Use notebook helpers
      const { notebook, model } = notebookHelpers.getNotebook(notebookTracker);
      notebookHelpers.validateCellIndex(model, cell_index);

      // Update cell content
      const cell = model.cells.get(cell_index);
      if (cell && cell.sharedModel) {
        cell.sharedModel.setSource(content);

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

  // EXECUTE_CELL implementation
  execute_cell: (payload: ExecuteCellPayload, notebookTracker: INotebookTracker, getNotebookContext: GetNotebookContextFn): ActionResult => {
    try {
      const { cell_index } = payload;

      // Use notebook helpers
      const { notebook } = notebookHelpers.getNotebook(notebookTracker);
      notebookHelpers.setActiveCellIndex(notebook, cell_index);

      // Execute the active cell
      NotebookActions.run(notebook, notebookTracker.currentWidget?.sessionContext);

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

  // DELETE_CELL implementation
  delete_cell: (payload: DeleteCellPayload, notebookTracker: INotebookTracker, getNotebookContext: GetNotebookContextFn): ActionResult => {
    try {
      const { cell_index } = payload;

      // Use notebook helpers
      const { notebook } = notebookHelpers.getNotebook(notebookTracker);
      notebookHelpers.setActiveCellIndex(notebook, cell_index);

      // Delete the cell
      NotebookActions.deleteCells(notebook);

      return {
        action_type: 'DELETE_CELL',
        result: {
          notebook_context: getNotebookContext()
        },
        success: true
      };
    } catch (error) {
      console.error('Error deleting cell:', error);
      return {
        action_type: 'DELETE_CELL',
        result: {},
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // SET_ACTIVE_CELL implementation
  set_active_cell: (payload: SetActiveCellPayload, notebookTracker: INotebookTracker, getNotebookContext: GetNotebookContextFn): ActionResult => {
    try {
      const { cell_index } = payload;

      // Use notebook helpers
      const { notebook } = notebookHelpers.getNotebook(notebookTracker);
      notebookHelpers.setActiveCellIndex(notebook, cell_index);

      return {
        action_type: 'SET_ACTIVE_CELL',
        result: {
          cell_index,
          notebook_context: getNotebookContext()
        },
        success: true
      };
    } catch (error) {
      console.error('Error setting active cell:', error);
      return {
        action_type: 'SET_ACTIVE_CELL',
        result: {},
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  // GET_NOTEBOOK_INFO implementation
  get_notebook_info: (payload: GetNotebookInfoPayload, notebookTracker: INotebookTracker, getNotebookContext: GetNotebookContextFn): ActionResult => {
    try {
      const { include_cell_content = true, include_outputs = true } = payload;

      // Get the notebook context
      const notebookContext = getNotebookContext();

      if (!notebookContext) {
        throw new Error('No active notebook found');
      }

      // Modify the response based on include flags
      let result = notebookContext;
      if (!include_cell_content || !include_outputs) {
        result = {
          ...result,
          cells: result.cells.map(cell => ({
            ...cell,
            content: include_cell_content ? cell.content : '',
            outputs: include_outputs ? cell.outputs : []
          }))
        };
      }

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
  }
};

// Helper function to create a tool execution function that can be used in a component
export function createToolExecutor(notebookTracker: INotebookTracker, getNotebookContext: GetNotebookContextFn) {
  return function executeAction(action: string, parameters: any): ActionResult {
    const toolFunction = toolFunctions[action as keyof typeof toolFunctions];
    if (!toolFunction) {
      return {
        action_type: action,
        result: {},
        success: false,
        error: `Unknown action: ${action}`
      };
    }
    
    return toolFunction(parameters, notebookTracker, getNotebookContext);
  };
}