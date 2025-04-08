// src/jupyterbuddyTools/tools.ts
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
  title: string;
  cells: Array<{
    index: number;
    type: string;
    content: string;
    execution_count?: number | null;
    outputs?: Array<any>;
  }>;
  activeCell: number;
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

/**
 * Creates a standardized cell operation result
 * @param action_type The type of action performed (CREATE_CELL, UPDATE_CELL, etc.)
 * @param cell_index The index of the cell that was operated on
 * @param cellOutputInfo The output information from the cell
 * @param cell_type Optional cell type (only needed for CREATE_CELL)
 */
const createCellOperationResult = (
  action_type: string,
  cell_index: number,
  cellOutputInfo: any,
  cell_type?: string
): ActionResult => {
  return {
    action_type,
    result: {
      cell_index,
      cell_type: cell_type || cellOutputInfo.cell_type,
      ...cellOutputInfo
    },
    success: true
  };
};

/**
 * Creates a standardized error result for tool operations
 * @param action_type The type of action that failed
 * @param error The error that occurred
 */
const createErrorResult = (
  action_type: string,
  error: unknown
): ActionResult => {
  return {
    action_type,
    result: {},
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error'
  };
};

// The tools available to JupyterBuddy - in OpenAI format
export const jupyterBuddyTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'create_cell',
      description:
        'Creates a new cell in the notebook at the specified position. All cells (both code and markdown) are automatically executed after creation.',
      parameters: {
        type: 'object',
        properties: {
          cell_type: {
            type: 'string',
            description: 'The type of cell to create (code or markdown).',
            enum: ['code', 'markdown']
          },
          content: {
            type: 'string',
            description: 'The content to place in the cell.'
          },
          position: {
            type: 'string',
            description:
              "Where to create the cell. Can be 'start', 'end', 'before_active', 'after_active', or a numeric index. Defaults to 'after_active'.",
            enum: ['start', 'end', 'before_active', 'after_active']
          }
        },
        required: ['cell_type', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_cell',
      description:
        'Updates the content of an existing cell in the notebook. All cells (both code and markdown) are automatically executed after update.',
      parameters: {
        type: 'object',
        properties: {
          cell_index: {
            type: 'integer',
            description: 'The index of the cell to update (0-based).'
          },
          content: {
            type: 'string',
            description: 'The new content for the cell.'
          }
        },
        required: ['cell_index', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_cell',
      description:
        'Executes a specific cell in the notebook. This is only needed for existing cells that have not been recently created or updated.',
      parameters: {
        type: 'object',
        properties: {
          cell_index: {
            type: 'integer',
            description: 'The index of the cell to execute (0-based).'
          }
        },
        required: ['cell_index']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_cell',
      description: 'Deletes a cell by index.',
      parameters: {
        type: 'object',
        properties: {
          cell_index: {
            type: 'integer',
            description: 'The index of the cell to delete (0-based).'
          }
        },
        required: ['cell_index']
      }
    }
  }
];

// Function to get tools as JSON for sending to backend
export function getToolsJSON(): string {
  return JSON.stringify(jupyterBuddyTools);
}

// Helper function to execute a cell (code or markdown) and capture results
const executeCodeCell = async (
  notebook: any,
  sessionContext: any,
  cell_index: number
): Promise<void> => {
  try {
    notebookHelpers.setActiveCellIndex(notebook, cell_index);
    await NotebookActions.run(notebook, sessionContext); // ✅ Wait for completion
  } catch (error) {
    console.error('Error executing cell:', error);
  }
};

// Helper function to extract only necessary output information from a cell (3)
const getCellOutputInfo = (
  notebookTracker: INotebookTracker,
  cell_index: number
): {
  cell_type: string;
  execution_count: number | null;
  output_text: string | null;
  error: string | null;
  status: 'success' | 'error';
} => {
  try {
    // Use the centralized notebookHelpers function to get cell info
    const cellContext = notebookHelpers.getNotebookContext(
      notebookTracker,
      cell_index,
      true
    );

    // If we couldn't get the context or no cells were returned
    if (!cellContext || !cellContext.cells || cellContext.cells.length === 0) {
      throw new Error(`Cell at index ${cell_index} not found`);
    }

    // Get the cell (there should only be one since we specified the index)
    const cell = cellContext.cells[0];

    // Initialize output variables
    let output_text = null;
    let error = null;
    let status: 'success' | 'error' = 'success';

    // Process outputs for code cells
    if (cell.type === 'code' && cell.outputs && cell.outputs.length > 0) {
      // Check for error outputs first - look for output_type === 'error'
      const errorOutput = cell.outputs.find((output: any) => output.output_type === 'error');

      if (errorOutput) {
        // Format error message to include both error name and value
        error = `${errorOutput.ename}: ${errorOutput.evalue}`;
        status = 'error';
      } else {
        // Look for text output
        const textOutput = cell.outputs.find((output: any) => output.text);
        if (textOutput) {
          output_text = textOutput.text;
        }
      }
    }

    return {
      cell_type: cell.type,
      execution_count: cell.execution_count || null,
      output_text,
      error,
      status
    };
  } catch (error) {
    console.error('Error getting cell output info:', error);
    return {
      cell_type: 'unknown',
      execution_count: null,
      output_text: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error'
    };
  }
};

// Tool implementation functions
export const toolFunctions = {
  // CREATE_CELL implementation
  create_cell: async (
    payload: CreateCellPayload,
    notebookTracker: INotebookTracker
  ): Promise<ActionResult> => {
    try {
      // Get cell type, content, and position from the payload
      const { cell_type, content, position } = payload;

      // Convert position format
      let positionType: string;
      let targetIndex: number | undefined;

      if (position === 'start') positionType = 'atStart';
      else if (position === 'end') positionType = 'atEnd';
      else if (position === 'before_active') positionType = 'aboveActive';
      else if (position === 'after_active' || position === undefined)
        positionType = 'belowActive';
      else if (typeof position === 'number') {
        positionType = 'atIndex';
        targetIndex = position;
      } else {
        positionType = 'belowActive'; // Default
      }

      // Use notebook helpers to get notebook and insert cell
      const { notebook } = notebookHelpers.getNotebook(notebookTracker);
      const newIndex = notebookHelpers.insertCellAtPosition(
        notebook,
        positionType,
        targetIndex
      );

      // Set cell type
      if (cell_type === 'markdown') {
        NotebookActions.changeCellType(notebook, 'markdown');
      }

      // Set content
      const cell = notebook.activeCell;
      if (cell && cell.model && cell.model.sharedModel) {
        cell.model.sharedModel.setSource(content);
      }

      // Execute the cell (both code and markdown cells)
      await executeCodeCell(
        notebook,
        notebookTracker.currentWidget?.sessionContext,
        newIndex
      );

      // Get just the output information for this cell
      const cellOutputInfo = getCellOutputInfo(notebookTracker, newIndex);

      // Return standardized result
      return createCellOperationResult(
        'CREATE_CELL',
        newIndex,
        cellOutputInfo,
        cell_type
      );
    } catch (error) {
      console.error('Error creating cell:', error);
      return createErrorResult('CREATE_CELL', error);
    }
  },
  // UPDATE_CELL implementation
  update_cell: async (
    payload: UpdateCellPayload,
    notebookTracker: INotebookTracker
  ): Promise<ActionResult> => {
    try {
      const { cell_index, content } = payload;

      // Use notebook helpers
      const { notebook, model } = notebookHelpers.getNotebook(notebookTracker);
      notebookHelpers.validateCellIndex(model, cell_index);

      // Update cell content
      const cell = model.cells.get(cell_index);
      if (cell && cell.sharedModel) {
        cell.sharedModel.setSource(content);

        // Execute the cell
        await executeCodeCell(
          notebook,
          notebookTracker.currentWidget?.sessionContext,
          cell_index
        );

        // Get just the output information for this cell
        const cellOutputInfo = getCellOutputInfo(notebookTracker, cell_index);

        return createCellOperationResult(
          'UPDATE_CELL',
          cell_index,
          cellOutputInfo
        );
      } else {
        throw new Error(`Could not access cell at index ${cell_index}`);
      }
    } catch (error) {
      console.error('Error updating cell:', error);
      return createErrorResult('UPDATE_CELL', error);
    }
  },
  // EXECUTE_CELL implementation
  execute_cell: async (
    payload: ExecuteCellPayload,
    notebookTracker: INotebookTracker
  ): Promise<ActionResult> => {
    try {
      const { cell_index } = payload;

      // Use notebook helpers
      const { notebook } = notebookHelpers.getNotebook(notebookTracker);

      // Execute the cell
      await executeCodeCell(
        notebook,
        notebookTracker.currentWidget?.sessionContext,
        cell_index
      );

      // Get just the output information for this cell
      const cellOutputInfo = getCellOutputInfo(notebookTracker, cell_index);

      return createCellOperationResult(
        'EXECUTE_CELL',
        cell_index,
        cellOutputInfo
      );
    } catch (error) {
      console.error('Error executing cell:', error);
      return createErrorResult('EXECUTE_CELL', error);
    }
  },

  // DELETE_CELL implementation
  delete_cell: async (
    payload: DeleteCellPayload,
    notebookTracker: INotebookTracker
  ): Promise<ActionResult> => {
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
          cell_index,
          message: `Cell at index ${cell_index} successfully deleted`
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
  }
};

/**
 * Creates a tool execution function that can be used to dynamically dispatch tool actions
 * @param notebookTracker The notebook tracker instance
 * @returns A function that executes the appropriate tool based on name
 */
export function createToolExecutor(notebookTracker: INotebookTracker) {
  return async function executeAction(
    action: string,
    parameters: any
  ): Promise<ActionResult> {
    const toolFunction = toolFunctions[action as keyof typeof toolFunctions];
    if (!toolFunction) {
      return {
        action_type: action,
        result: {},
        success: false,
        error: `Unknown tool: ${action}`
      };
    }

    // Await the tool function since it might be async
    return await toolFunction(parameters, notebookTracker);
  };
}
