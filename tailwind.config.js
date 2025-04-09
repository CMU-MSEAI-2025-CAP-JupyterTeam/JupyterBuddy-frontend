// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export const content = [
  './src/**/*.{js,ts,jsx,tsx}',
  './lib/**/*.{js,ts,jsx,tsx}'
];
export const theme = {
  extend: {}
};
export const darkMode = 'class';
export const important = true;
export const corePlugins = {
  preflight: false
};
