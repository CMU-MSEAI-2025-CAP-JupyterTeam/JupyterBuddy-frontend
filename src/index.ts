//index.ts
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from "@jupyterlab/application";


import { INotebookTracker } from "@jupyterlab/notebook";
import { AppWidget } from "./widgets/AppWidget";

/**
 * Initialization data for the JupyterBuddy extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: "jupyterbuddy:plugin",
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, notebookTracker: INotebookTracker) => {
    console.log("JupyterLab extension JupyterBuddy is activated!");

    // Create the widget
    const widget = new AppWidget(app, notebookTracker);
    widget.id = "jupyterbuddy-widget";
    widget.title.label = "JupyterBuddy";
    widget.title.closable = true;

    // Add the widget to the left panel
    app.shell.add(widget, "left", { rank: 500 });
  }
};

export default plugin;