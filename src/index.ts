import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jupyterBuddy extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterBuddy:plugin',
  description: 'A JupyterLab extension that enables users to perform AI/ML workflows seamlessly via a natural language conversational interface integrated directly into JupyterLab.',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyterBuddy is activated!');
  }
};

export default plugin;
