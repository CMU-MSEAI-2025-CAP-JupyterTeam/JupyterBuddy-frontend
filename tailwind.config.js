/** @type {import('tailwindcss').Config} */
export default{
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx}'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  important: true, // Make all Tailwind utilities use !important
  corePlugins: {
    preflight: false, // Avoid conflicts with JupyterLab styles
  }
};