// process-tailwind.js
const tailwindcssPostcss = require('@tailwindcss/postcss');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const fs = require('fs');
const path = require('path');

const inputFile = './style/index.css';
const outputFile = './style/index.css';

// Read the input CSS file
const css = fs.readFileSync(inputFile, 'utf8');

// Process the CSS with Tailwind and PostCSS
postcss([
  tailwindcssPostcss,
  autoprefixer
])
  .process(css, {
    from: inputFile,
    to: outputFile
  })
  .then(result => {
    // Write the processed CSS to the output file
    fs.writeFileSync(outputFile, result.css);
    console.log('CSS processing completed successfully!');
  })
  .catch(error => {
    console.error('Error processing CSS:', error);
    process.exit(1);
  });