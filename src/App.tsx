import React, { useState } from "react"; // Import React and useState hook for managing state
import { JupyterFrontEnd } from "@jupyterlab/application"; // JupyterLab's main application instance
import { NotebookActions, INotebookTracker } from "@jupyterlab/notebook"; // Actions for manipulating notebook cells
import { CodeCellModel } from "@jupyterlab/cells"; // Interfaces for working with notebook cells

// Define the expected props for the component
interface Props {
  app: JupyterFrontEnd; // JupyterLab application instance
  notebookTracker: INotebookTracker; // Notebook tracker to track active notebooks
}

// Define the main React component
function App({ app, notebookTracker }: Props) {
  // State to store user input for updating a cell
  const [cellContent, setCellContent] = useState("");
  const [cellIndex, setCellIndex] = useState(0);
  const [output, setOutput] = useState(""); // State to store retrieved cell output

  /**
   * Get the currently active notebook in JupyterLab
   */
  function getActiveNotebook() {
    return notebookTracker.currentWidget?.content || null;
  }

  /**
   * Insert a new cell below the currently active cell
   */
  function insertNewCell() {
    const notebook = getActiveNotebook();
    if (notebook) {
      NotebookActions.insertBelow(notebook); // Insert a new cell below the active one
    }
  }

  /**
   * Run the currently active cell
   */
  function runCell() {
    const notebookPanel = notebookTracker.currentWidget;
    if (notebookPanel) {
      const notebook = notebookPanel.content;
      NotebookActions.run(notebook, notebookPanel.sessionContext); // Execute the cell
    }
  }

  /**
   * Delete the currently selected cell
   */
  function deleteCell() {
    const notebook = getActiveNotebook();
    if (notebook) {
      NotebookActions.deleteCells(notebook); // Delete selected cell(s)
    }
  }

  /**
   * Retrieve the output of a specific cell based on user input (cell index)
   */
  function getCellOutput() {
    const notebook = getActiveNotebook();
    if (!notebook) return;

    const cell = notebook.model?.cells.get(cellIndex);
    if (cell instanceof CodeCellModel) {
      // Get the last output of the cell
      const lastOutput = cell.outputs.get(cell.outputs.length - 1);
      setOutput(lastOutput ? JSON.stringify(lastOutput.toJSON()) : "No output");
    } else {
      setOutput("Selected cell is not a code cell.");
    }
  }

  /**
   * Update the content of a specific cell based on user input (cell index & new content)
   */
  function updateCell() {
    const notebook = getActiveNotebook();
    if (!notebook) return;

    const cell = notebook.model?.cells.get(cellIndex);
    if (cell) {
      cell.sharedModel.setSource(cellContent); // ✅ Update the cell's content
    }
  }

  return (
    <div className="app-container">
      <h2>Notebook Controls</h2>

      {/* Buttons for notebook actions */}
      <button onClick={insertNewCell}>➕ Add Cell</button>
      <button onClick={runCell}>▶️ Run Cell</button>
      <button onClick={deleteCell}>🗑️ Delete Cell</button>

      <h3>Modify a Cell</h3>
      {/* Input field for selecting cell index */}
      <input
        type="number"
        value={cellIndex}
        onChange={(e) => setCellIndex(Number(e.target.value))}
        placeholder="Cell Index"
      />
      {/* Input field for entering new cell content */}
      <input
        type="text"
        value={cellContent}
        onChange={(e) => setCellContent(e.target.value)}
        placeholder="New Cell Content"
      />
      <button onClick={updateCell}>✏️ Update Cell</button>

      <h3>Retrieve Cell Output</h3>
      <button onClick={getCellOutput}>🔍 Get Cell Output</button>
      <div className="output-container">
        <strong>Output:</strong> {output}
      </div>
    </div>
  );
}

export default App;
