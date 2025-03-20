// src/jupyterbuddyTools/notebookHelpers.ts
// Helper functions for notebook operations

import { NotebookActions } from '@jupyterlab/notebook';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ICodeCellModel } from '@jupyterlab/cells';

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

  // Get enhanced notebook state including execution info and outputs
  getEnhancedNotebookState: (notebook: any) => {
    const model = notebook.model;
    
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
  }
};