import { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { INotebookTracker } from "@jupyterlab/notebook";
import { AppWidget } from "./widgets/AppWidget";

const extension: JupyterFrontEndPlugin<void> = {
  id: "my-react-extension_2",
  autoStart: true,
  requires: [INotebookTracker], // Require NotebookTracker for tracking notebooks
  activate: (app: JupyterFrontEnd, notebookTracker: INotebookTracker) => {
    console.log("JupyterLab React Extension is activated!");

    // Create an instance of the React-based widget
    const widget = new AppWidget(app, notebookTracker);
    widget.id = "react-app";
    widget.title.label = "JupyterBuddy";
    widget.title.closable = true;

    // Add the widget to the left sidebar
    app.shell.add(widget, "left");
  },
};

export default extension;
