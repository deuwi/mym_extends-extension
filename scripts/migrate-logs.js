/**
 * Migration Script: Replace commented console.log with debugLog
 * 
 * This script helps migrate commented console.log statements to use the new debugLog helper.
 * It provides both automated replacement and verification.
 * 
 * Usage:
 *   node scripts/migrate-logs.js --dry-run    # Preview changes
 *   node scripts/migrate-logs.js --apply      # Apply changes
 *   node scripts/migrate-logs.js --verify     # Verify migration
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  sourceDir: '.',
  includePatterns: ['**/*.js'],
  excludePatterns: [
    'node_modules/**',
    'build-*/**',
    'tests/**',
    'minify.js',
    'browser-polyfill.js',
    'scripts/**',
  ],
};

// Patterns to match
const PATTERNS = {
  // Match: // console.log(...) or //console.log(...)
  commentedLog: /^\s*\/\/\s*console\.log\((.*)\);?\s*$/gm,
  
  // Match: // // console.log (multiple slashes)
  multiCommentLog: /^\s*\/\/\s*\/\/\s*console\.log\((.*)\);?\s*$/gm,
  
  // Match multi-line commented logs
  multiLineStart: /^\s*\/\/\s*console\.log\($/,
  multiLineEnd: /^\s*\/\/\s*\);?\s*$/,
};

/**
 * Get all JavaScript files to process
 */
function getJavaScriptFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(CONFIG.sourceDir, fullPath);
    
    // Skip excluded patterns
    if (CONFIG.excludePatterns.some(pattern => 
      minimatch(relativePath, pattern))) {
      continue;
    }
    
    if (entry.isDirectory()) {
      getJavaScriptFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Simple glob matcher (basic implementation)
 */
function minimatch(path, pattern) {
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexPattern}$`).test(path);
}

/**
 * Analyze a file for commented logs
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const matches = [];
  
  let inMultiLine = false;
  let multiLineStart = null;
  
  lines.forEach((line, index) => {
    // Single-line commented log
    if (PATTERNS.commentedLog.test(line) || PATTERNS.multiCommentLog.test(line)) {
      matches.push({
        line: index + 1,
        type: 'single',
        original: line,
        suggestion: line.replace(/^\s*\/\/\s*(\/\/)?\s*console\.log/, 'debugLog'),
      });
    }
    
    // Multi-line start
    if (PATTERNS.multiLineStart.test(line)) {
      inMultiLine = true;
      multiLineStart = index;
    }
    
    // Multi-line end
    if (inMultiLine && PATTERNS.multiLineEnd.test(line)) {
      matches.push({
        line: multiLineStart + 1,
        type: 'multiline',
        lineEnd: index + 1,
        original: lines.slice(multiLineStart, index + 1).join('\n'),
      });
      inMultiLine = false;
      multiLineStart = null;
    }
  });
  
  return { filePath, matches, totalLines: lines.length };
}

/**
 * Apply migrations to a file
 */
function migrateFile(filePath, dryRun = true) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Replace single-line commented logs
  const newContent = content.replace(
    /^(\s*)\/\/\s*(\/\/)?\s*console\.log\(/gm,
    (match, indent) => {
      modified = true;
      return `${indent}debugLog(`;
    }
  );
  
  if (modified && !dryRun) {
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
  
  return { filePath, modified, changes: modified ? 1 : 0 };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--dry-run';
  
  console.log('🔍 MYM Chat Live - Log Migration Tool\n');
  
  // Get all files
  const files = getJavaScriptFiles(CONFIG.sourceDir);
  console.log(`📁 Found ${files.length} JavaScript files to analyze\n`);
  
  if (mode === '--verify' || mode === '--dry-run') {
    // Analyze mode
    let totalMatches = 0;
    const results = [];
    
    files.forEach(file => {
      const analysis = analyzeFile(file);
      if (analysis.matches.length > 0) {
        results.push(analysis);
        totalMatches += analysis.matches.length;
      }
    });
    
    console.log(`📊 Found ${totalMatches} commented log statements in ${results.length} files\n`);
    
    results.forEach(result => {
      console.log(`\n📄 ${path.relative(CONFIG.sourceDir, result.filePath)}`);
      console.log(`   ${result.matches.length} match(es)`);
      
      result.matches.slice(0, 3).forEach(match => {
        console.log(`   Line ${match.line}: ${match.type}`);
        if (match.suggestion) {
          console.log(`     Before: ${match.original.trim()}`);
          console.log(`     After:  ${match.suggestion.trim()}`);
        }
      });
      
      if (result.matches.length > 3) {
        console.log(`   ... and ${result.matches.length - 3} more`);
      }
    });
    
    if (mode === '--dry-run') {
      console.log('\n💡 Run with --apply to perform the migration');
    }
  } else if (mode === '--apply') {
    // Apply mode
    let totalModified = 0;
    
    files.forEach(file => {
      const result = migrateFile(file, false);
      if (result.modified) {
        totalModified++;
        console.log(`✅ ${path.relative(CONFIG.sourceDir, file)}`);
      }
    });
    
    console.log(`\n✨ Modified ${totalModified} files`);
    console.log('⚠️  Please review the changes and run tests before committing');
  } else {
    console.log('Usage: node scripts/migrate-logs.js [--dry-run|--apply|--verify]');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { analyzeFile, migrateFile };
