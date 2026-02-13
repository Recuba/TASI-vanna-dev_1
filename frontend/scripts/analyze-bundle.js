#!/usr/bin/env node

/**
 * Bundle Analysis Script
 *
 * Runs `next build` with ANALYZE=true to generate bundle analysis reports.
 * Works on both Windows and Unix without requiring cross-env.
 *
 * Usage:
 *   node scripts/analyze-bundle.js
 *   npm run analyze
 */

const { execSync } = require('child_process');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');

console.log('Starting bundle analysis...');
console.log('Output will open in your browser when complete.\n');

try {
  execSync('npx next build', {
    cwd: frontendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ANALYZE: 'true',
    },
  });
  console.log('\nBundle analysis complete. Check the browser tabs for results.');
} catch (error) {
  console.error('\nBundle analysis failed.');
  process.exit(1);
}
