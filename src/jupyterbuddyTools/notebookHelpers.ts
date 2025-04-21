// src/jupyterbuddyTools/notebookHelpers.ts
// Helper functions for notebook operations

import { NotebookActions } from '@jupyterlab/notebook';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ICodeCellModel } from '@jupyterlab/cells';
import { JupyterFrontEnd } from '@jupyterlab/application';

/**
 * Simplifies notebook cell outputs into a JSON-friendly, token-efficient format.
 * Preserves error details (`ename`, `evalue`) to support automatic error recovery. (2)
 */
function simplifyOutputs(outputs: any[]): any[] {
  // console.log("\n...........Full cell output...........");
  // console.log('Cell context:', outputs);
  // console.log("..............Full cell output...........");

  if (!outputs || outputs.length === 0) return [];

  return outputs.map(output => {
    const simplified: any = {
      output_type: output.output_type
    };

    // Preserve error metadata for detection and recovery
    if (output.output_type === 'error') {
      simplified.ename = output.ename;
      simplified.evalue = output.evalue;
      simplified.traceback = output.traceback; // Optional: useful for debugging
      return simplified;
    }

    // Handle plain text outputs from `print()` or `display()`
    if (output.data && output.data['text/plain']) {
      const plainText = output.data['text/plain'];
      simplified.text = Array.isArray(plainText)
        ? plainText.join('\n')
        : String(plainText);
      return simplified;
    }

    // Handle stream output (e.g., stdout, stderr)
    if (output.text) {
      simplified.text = Array.isArray(output.text)
        ? output.text.join('\n')
        : String(output.text);
      return simplified;
    }

    // Catch-all fallback for unrecognized formats
    simplified.text = '[Output in non-text format]';
    return simplified;
  });
}

export const notebookHelpers = {
  // Get notebook and model, throwing error if not available
  getNotebook: (notebookTracker: INotebookTracker) => {
    const notebook = notebookTracker.currentWidget?.content;
    if (!notebook) throw new Error("No active notebook");
    
    const model = notebook.model;
    if (!model) throw new Error("No notebook model");
    
    return { notebook, model };
  },

  // Validate cell index is within bounds
  validateCellIndex: (model: any, index: number) => {
    if (index < 0 || index >= model.cells.length) {
      throw new Error(`Invalid cell index: ${index}. Valid range: 0-${model.cells.length - 1}`);
    }
  },

  // Set active cell by index, with validation
  setActiveCellIndex: (notebook: any, index: number) => {
    const model = notebook.model;
    if (index < 0 || index >= model.cells.length) {
      throw new Error(`Invalid cell index: ${index}. Valid range: 0-${model.cells.length - 1}`);
    }
    notebook.activeCellIndex = index;
    return index;
  },

  // Insert cell at position with enhanced logic
  insertCellAtPosition: (notebook: any, position: string, targetIndex?: number) => {
    const model = notebook.model;
    
    // Handle empty notebook
    if (model.cells.length === 0) {
      NotebookActions.insertAbove(notebook);
      return 0;
    }
    
    // Handle different positions
    switch (position) {
      case "atStart":
        notebook.activeCellIndex = 0;
        NotebookActions.insertAbove(notebook);
        break;
        
      case "atEnd":
        notebook.activeCellIndex = model.cells.length - 1;
        NotebookActions.insertBelow(notebook);
        break;
        
      case "belowActive":
        if (!notebook.activeCell) {
          notebook.activeCellIndex = model.cells.length - 1;
        }
        NotebookActions.insertBelow(notebook);
        break;
        
      case "aboveActive":
        if (!notebook.activeCell) {
          notebook.activeCellIndex = 0;
        }
        NotebookActions.insertAbove(notebook);
        break;
        
      case "atIndex":
        if (targetIndex === undefined) {
          throw new Error("targetIndex required for 'atIndex' position");
        }
        
        if (targetIndex < 0 || targetIndex > model.cells.length) {
          throw new Error(`Invalid target index: ${targetIndex}. Valid range: 0-${model.cells.length}`);
        }
        
        if (targetIndex === model.cells.length) {
          notebook.activeCellIndex = model.cells.length - 1;
          NotebookActions.insertBelow(notebook);
        } else {
          notebook.activeCellIndex = targetIndex;
          NotebookActions.insertAbove(notebook);
        }
        break;
        
      default:
        throw new Error(`Invalid position: ${position}`);
    }
    
    return notebook.activeCellIndex;
  },

  // Get enhanced notebook state including execution info and outputs (1)
  getEnhancedNotebookState: (notebook: any) => {
    const model = notebook.model;
    console.log("\n...........  print notebook state...........");
    console.log('Notebook state:', model);
    
    return {
      activeCellIndex: notebook.activeCellIndex,
      hasActiveCell: notebook.activeCell !== null,
      isEmpty: model.cells.length === 0,
      totalCells: model.cells.length,
      cells: Array.from({length: model.cells.length}, (_, i) => {
        const cell = model.cells.get(i);
        return {
          index: i,
          type: cell.type,
          isActive: i === notebook.activeCellIndex,
          content: cell.sharedModel.getSource(),
          executionCount: cell.type === 'code' ? 
            ((cell as ICodeCellModel).executionCount ?? null) : null,
          outputs: cell.type === 'code' ? 
            ((cell as ICodeCellModel).outputs?.toJSON() ?? []) : []
        };
      })
    };
  },
  
  /**
   * Get streamlined notebook context for the LLM
   * @param notebookTracker The notebook tracker
   * @param cellIndex Optional specific cell index to retrieve
   * @param includeOutputs Whether to include cell outputs
   * @returns Streamlined notebook context
   */
  getNotebookContext: (notebookTracker: INotebookTracker, cellIndex?: number, includeOutputs: boolean = true) => {
    try {
      const { notebook} = notebookHelpers.getNotebook(notebookTracker);
      
      // Get enhanced notebook state which already has the information we need
      const state = notebookHelpers.getEnhancedNotebookState(notebook);
      
      // Create a streamlined version of cells
      const processCell = (cell: any) => {
        if (!cell) return null;
        
        // Base cell information
        const cellData: any = {
          index: cell.index,
          type: cell.type,
          content: cell.content,
        };
        
        // Only add execution count for code cells
        if (cell.type === 'code' && cell.executionCount !== null) {
          cellData.execution_count = cell.executionCount;
        }
        
        // Only include outputs if requested and if they exist
        if (includeOutputs && cell.type === 'code' && cell.outputs && cell.outputs.length > 0) {
          cellData.outputs = simplifyOutputs(cell.outputs);
        }
        
        return cellData;
      };
      
      // Get either one specific cell or all cells
      let cells;
      if (cellIndex !== undefined) {
        // Validate cell index if provided
        if (cellIndex < 0 || cellIndex >= state.cells.length) {
          throw new Error(`Invalid cell index: ${cellIndex}. Valid range: 0-${state.cells.length - 1}`);
        }
        cells = [processCell(state.cells[cellIndex])].filter(Boolean);
      } else {
        cells = state.cells.map(processCell).filter(Boolean);
      }
      
      // Return streamlined context
      return {
        title: notebook.title.label,
        cells: cells,
        activeCell: notebook.activeCellIndex
      };
    } catch (error) {
      console.error('Error getting notebook context:', error);
      return null;
    }
  }
};

/**
 * Save a dataset to the "data/" folder. Creates the folder if it doesn't exist.
 */
export async function saveDatasetToNotebook(app: JupyterFrontEnd, file: File): Promise<string> {
  const contents = app.serviceManager.contents;
  const folder = 'data';
  const filePath = `${folder}/${file.name}`;

  // Check if 'data/' directory exists
  try {
    await contents.get(folder); // Will throw if not exists
  } catch (err) {
    console.warn(`[📁 Creating directory] ${folder}`);

    // Create it using a trick: newUntitled returns folder name
    await contents.newUntitled({
      path: '',
      type: 'directory'
    });

    // Note: This creates 'Untitled Folder', you may rename it via .rename() to 'data' if needed
    await contents.rename('Untitled Folder', folder);
  }

  // Read content
  const content = await file.text();

  // Save file
  await contents.save(filePath, {
    type: 'file',
    format: 'text', // or 'base64' if binary
    content
  });

  const finalFilePath = `./${file.name}`

  console.log(`[✅ Saved] ${finalFilePath}`);
  return finalFilePath;
}