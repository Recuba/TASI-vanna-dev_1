#!/usr/bin/env node
/**
 * RTL lint script — catches physical Tailwind CSS properties that should use
 * logical equivalents for proper RTL/LTR support.
 *
 * Violations:
 *   ml-* -> ms-*    mr-* -> me-*
 *   pl-* -> ps-*    pr-* -> pe-*
 *   text-left -> text-start    text-right -> text-end
 *   border-l-* -> border-s-*  border-r-* -> border-e-*
 *   left-* -> start-*         right-* -> end-*
 *   rounded-l-* -> rounded-s-* rounded-r-* -> rounded-e-*
 *
 * Usage: node scripts/lint-rtl.js [--fix]
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Directories to skip
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '__mocks__']);

// Physical -> Logical mapping (for --fix mode and reporting)
const REPLACEMENTS = [
  { pattern: /\bml-/g, replacement: 'ms-', label: 'ml-* -> ms-*' },
  { pattern: /\bmr-/g, replacement: 'me-', label: 'mr-* -> me-*' },
  { pattern: /\bpl-/g, replacement: 'ps-', label: 'pl-* -> ps-*' },
  { pattern: /\bpr-/g, replacement: 'pe-', label: 'pr-* -> pe-*' },
  { pattern: /\btext-left\b/g, replacement: 'text-start', label: 'text-left -> text-start' },
  { pattern: /\btext-right\b/g, replacement: 'text-end', label: 'text-right -> text-end' },
  { pattern: /\bborder-l-/g, replacement: 'border-s-', label: 'border-l-* -> border-s-*' },
  { pattern: /\bborder-r-/g, replacement: 'border-e-', label: 'border-r-* -> border-e-*' },
  { pattern: /\brounded-l-/g, replacement: 'rounded-s-', label: 'rounded-l-* -> rounded-s-*' },
  { pattern: /\brounded-r-/g, replacement: 'rounded-e-', label: 'rounded-r-* -> rounded-e-*' },
];

// Combined detection regex (used for fast line-level scanning)
const VIOLATION_RE = /\b(ml-|mr-|pl-|pr-|text-left\b|text-right\b|border-l-|border-r-|rounded-l-|rounded-r-|(?<!inset-x-)(?<!\/)left-|(?<!inset-x-)(?<!\/)right-)/;

// Lines containing these patterns are exempt from left-/right- violations
// (centering transforms, intentional LTR overrides for charts/code)
const EXEMPT_PATTERNS = [
  /dir\s*=\s*["']ltr["']/,              // intentional LTR override
  /left-1\/2/,                           // transform-based centering (direction-neutral)
  /-translate-x-1\/2/,                   // paired with left-1/2 for centering
  /inset-x-/,                            // already using logical inset
];

function isExemptLine(line) {
  return EXEMPT_PATTERNS.some((pat) => pat.test(line));
}

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    // Skip import lines
    if (/^\s*import\s/.test(line)) continue;

    if (VIOLATION_RE.test(line)) {
      // Skip lines with intentional LTR overrides or centering patterns
      if (isExemptLine(line)) continue;

      // Identify which specific violations are on this line
      const matched = [];
      for (const r of REPLACEMENTS) {
        if (r.pattern.test(line)) {
          matched.push(r.label);
          // Reset lastIndex since we use /g flag
          r.pattern.lastIndex = 0;
        }
      }
      if (matched.length > 0) {
        violations.push({
          line: i + 1,
          text: line.trim(),
          rules: matched,
        });
      }
    }
  }
  return violations;
}

// ---- main ----
const files = walkFiles(SRC_DIR);
let totalViolations = 0;
const fileViolations = [];

for (const f of files) {
  const v = scanFile(f);
  if (v.length > 0) {
    totalViolations += v.length;
    fileViolations.push({ file: f, violations: v });
  }
}

if (totalViolations === 0) {
  console.log('No RTL violations found. All files use logical Tailwind properties.');
  process.exit(0);
} else {
  console.error(`Found ${totalViolations} RTL violation(s) in ${fileViolations.length} file(s):\n`);
  for (const { file, violations } of fileViolations) {
    const rel = path.relative(path.join(__dirname, '..'), file);
    console.error(`  ${rel}`);
    for (const v of violations) {
      console.error(`    L${v.line}: ${v.rules.join(', ')}`);
      console.error(`           ${v.text}`);
    }
    console.error('');
  }
  console.error('Replace physical properties with logical equivalents for RTL support.');
  console.error('See: https://tailwindcss.com/blog/tailwindcss-v3-3#logical-properties');
  process.exit(1);
}
