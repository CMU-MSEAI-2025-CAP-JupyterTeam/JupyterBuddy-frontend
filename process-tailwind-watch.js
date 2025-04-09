// process-tailwind-watch.js
const tailwindcssPostcss = require('@tailwindcss/postcss');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const inputFile = './style/index.css';
const outputFile = './style/index.css';

// Function to process CSS
function processCss() {
  console.log('Processing CSS...');
  const css = fs.readFileSync(inputFile, 'utf8');
  
  postcss([
    tailwindcssPostcss,
    autoprefixer
  ])
    .process(css, {
      from: inputFile,
      to: outputFile
    })
    .then(result => {
      fs.writeFileSync(outputFile, result.css);
      console.log('CSS processing completed successfully!');
    })
    .catch(error => {
      console.error('Error processing CSS:', error);
    });
}

// Initial processing
processCss();

// Watch for changes
console.log('Watching for CSS changes...');
chokidar.watch(['./src/**/*.{ts,tsx}', './style/**/*.css'], {
  ignored: /node_modules/,
  persistent: true
}).on('change', (path) => {
  console.log(`File ${path} changed, reprocessing CSS...`);
  processCss();
});

// Keep the process running
process.stdin.resume();