/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {}
  },
  darkMode: 'class',
  important: true,
  corePlugins: {
    preflight: false
  },
  safelist: [
    'dark',
    'dark:bg-gray-900',
    'dark:text-white',
    'bg-white',
    'text-black'
  ]
};
