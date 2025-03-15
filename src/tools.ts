// tools.ts
// This file defines the available tools for JupyterBuddy and their implementations
// It serves as a single source of truth for tool definitions and functions

import { NotebookActions } from '@jupyterlab/notebook';
import { CodeCell, MarkdownCell } from '@jupyterlab/cells';
import { NotebookTracker } from '@jupyterlab/notebook';
import { INotebookModel } from '@jupyterlab/notebook';
import { Notebook } from '@jupyterlab/notebook';

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  enum?: string[] | number[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: {
      [key: string]: ToolParameter;
    };
    required?: string[];
  };
}

export interface ActionResult {
  action_type: string;
  result: Record<string, any>;
  success: boolean;
  error?: string;
}

export interface NotebookContext {
  cells: Array<{
    cell_type: string;
    content: string;
    execution_count?: number | null;
    metadata?: Record<string, any>;
    outputs?: Array<Record<string, any>>;
  }>;
  metadata: Record<string, any>;
  nbformat: number;
  nbformat_minor: number;
}

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

export interface GetNotebookInfoPayload {
  include_cell_content?: boolean;
}

// Union type for all payload types
export type ToolPayload = CreateCellPayload | UpdateCellPayload | ExecuteCellPayload | GetNotebookInfoPayload;

// Type for getNotebookContext function
export type GetNotebookContextFn = () => NotebookContext | null;

// The tools available to JupyterBuddy
export const jupyterBuddyTools: Tool[] = [
  {
    name: "create_cell",
    description: "Creates a new cell in the notebook at the specified position.",
    parameters: {
      type: "object",
      properties: {
        cell_type: {
          name: "cell_type",
          type: "string",
          description: "The type of cell to create (code or markdown).",
          required: true,
          enum: ["code", "markdown"]
        },
        content: {
          name: "content",
          type: "string", 
          description: "The content to place in the cell.",
          required: true
        },
        position: {
          name: "position",
          type: "string",
          description: "Where to create the cell. Can be 'start', 'end', 'before_active', 'after_active', or a numeric index. Defaults to 'after_active'.",
          required: false,
          enum: ["start", "end", "before_active", "after_active"]
        }
      },
      required: ["cell_type", "content"]
    }
  },
  {
    name: "update_cell",
    description: "Updates the content of an existing cell in the notebook.",
    parameters: {
      type: "object",
      properties: {
        cell_index: {
          name: "cell_index",
          type: "integer",
          description: "The index of the cell to update (0-based).",
          required: true
        },
        content: {
          name: "content",
          type: "string",
          description: "The new content for the cell.",
          required: true
        }
      },
      required: ["cell_index", "content"]
    }
  },
  {
    name: "execute_cell",
    description: "Executes a specific cell in the notebook.",
    parameters: {
      type: "object",
      properties: {
        cell_index: {
          name: "cell_index",
          type: "integer",
          description: "The index of the cell to execute (0-based).",
          required: true
        }
      },
      required: ["cell_index"]
    }
  },
  {
    name: "get_notebook_info",
    description: "Gets information about the current notebook structure and content.",
    parameters: {
      type: "object",
      properties: {
        include_cell_content: {
          name: "include_cell_content",
          type: "boolean",
          description: "Whether to include the content of each cell in the response. Defaults to true.",
          required: false
        }
      },
      required: []
    }
  }
];

// Function to get tools as JSON for sending to backend
export function getToolsJSON(): string {
  return JSON.stringify(jupyterBuddyTools);
}

// Type for tool functions
export type ToolFunction<T extends ToolPayload> = (
  payload: T,
  notebookTracker: NotebookTracker,
  getNotebookContext: GetNotebookContextFn
) => ActionResult;

// Tool implementation functions with proper typing
export const toolFunctions: {
  create_cell: ToolFunction<CreateCellPayload>;
  update_cell: ToolFunction<UpdateCellPayload>;
  execute_cell: ToolFunction<ExecuteCellPayload>;
  get_notebook_info: ToolFunction<GetNotebookInfoPayload>;
} = {
  // CREATE_CELL implementation
  create_cell: (payload, notebookTracker, getNotebookContext) => {
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
      const notebook: Notebook = notebookPanel.content;

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

  // UPDATE_CELL implementation
  update_cell: (payload, notebookTracker, getNotebookContext) => {
    try {
      const { cell_index, content } = payload;

      // Get the current notebook
      const notebookPanel = notebookTracker.currentWidget;

      if (!notebookPanel) {
        throw new Error('No active notebook found');
      }

      const notebook: Notebook = notebookPanel.content;
      const model: INotebookModel | null = notebook.model;

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

      const cell = model.cells.get(cell_index);
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

  // EXECUTE_CELL implementation
  execute_cell: (payload, notebookTracker, getNotebookContext) => {
    try {
      const { cell_index } = payload;

      // Get the current notebook
      const notebookPanel = notebookTracker.currentWidget;

      if (!notebookPanel) {
        throw new Error('No active notebook found');
      }

      const notebook: Notebook = notebookPanel.content;

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

  // GET_NOTEBOOK_INFO implementation
  get_notebook_info: (payload, notebookTracker, getNotebookContext) => {
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
  }
};

// Type for mapping action names to their payloads
interface ActionPayloadMap {
  create_cell: CreateCellPayload;
  update_cell: UpdateCellPayload;
  execute_cell: ExecuteCellPayload;
  get_notebook_info: GetNotebookInfoPayload;
}

// Helper function to create a tool execution function that can be used in a component
export function createToolExecutor(notebookTracker: NotebookTracker, getNotebookContext: GetNotebookContextFn) {
  return function executeAction<K extends keyof ActionPayloadMap>(
    action: K, 
    parameters: ActionPayloadMap[K]
  ): ActionResult {
    const toolFunction = toolFunctions[action];
    if (!toolFunction) {
      return {
        action_type: action,
        result: {},
        success: false,
        error: `Unknown action: ${action}`
      };
    }
    
    // Use type assertion to tell TypeScript that this function call is valid
    // We know it's valid because our ActionPayloadMap ensures parameter types match function expectations
    return (toolFunction as any)(parameters, notebookTracker, getNotebookContext);
  };
}