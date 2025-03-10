// src/widgets/AppWidget.tsx
import { ReactWidget } from '@jupyterlab/apputils';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import React from 'react';
import App from '../App';

export class AppWidget extends ReactWidget {
  private app: JupyterFrontEnd;
  private notebookTracker: INotebookTracker;

  constructor(app: JupyterFrontEnd, notebookTracker: INotebookTracker) {
    super();
    this.addClass('jp-JupyterBuddy');
    this.app = app;
    this.notebookTracker = notebookTracker;
  }

  render(): JSX.Element {
    return <App app={this.app} notebookTracker={this.notebookTracker} />;
  }
}