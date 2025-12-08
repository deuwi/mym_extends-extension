# 🔧 Migration Guide: Commented Logs to debugLog

## Overview

This guide explains how to migrate commented `console.log` statements to use the new `debugLog()` helper function.

## Why Migrate?

### Before
```javascript
// console.log('🔍 Searching for items...');
// console.log('User:', username);
```

**Problems:**
- Clutters codebase
- Can't be toggled on/off
- Confusing for new developers
- Hard to maintain

### After
```javascript
debugLog('🔍 [Module] Searching for items...');
debugLog('🔍 [Module] User:', username);
```

**Benefits:**
- ✅ Clean code (no commented lines)
- ✅ Toggle with `DEBUG = true` in config.js
- ✅ Consistent logging format
- ✅ Easy to find with search

## Migration Methods

### Method 1: Automated Script (Recommended)

```bash
# 1. Preview changes
node scripts/migrate-logs.js --dry-run

# 2. Review the suggestions
# The script will show what will be changed

# 3. Apply changes
node scripts/migrate-logs.js --apply

# 4. Verify
node scripts/migrate-logs.js --verify
```

### Method 2: Manual Migration

#### Step 1: Find Commented Logs

```bash
# PowerShell
Select-String -Path *.js,modules/*.js -Pattern "^\s*// console.log" -CaseSensitive

# Or use your IDE's "Find in Files"
# Search for: ^\s*// console\.log
# (Enable regex mode)
```

#### Step 2: Replace Pattern

**Find:** `// console.log(`  
**Replace:** `debugLog(`

**Important:** Keep the log message and arguments!

#### Step 3: Add Module Prefix

```javascript
// ❌ Before
// console.log('Fetching data...');

// ✅ After
debugLog('🔍 [ModuleName] Fetching data...');
```

**Module Prefixes:**
- `[Background]` - background.js
- `[Popup]` - popup.js
- `[Content]` - content.js
- `[Badges]` - modules/badges.js
- `[Notes]` - modules/notes.js
- `[Stats]` - modules/stats.js
- `[Emoji]` - modules/emoji.js
- `[Conversations]` - modules/conversations-list.js
- `[Keyboard]` - modules/keyboard-shortcuts.js
- `[Polling]` - modules/auto-polling.js
- `[Sidebar]` - modules/sidebar-toggle.js

## Examples

### Single Line Logs

```javascript
// ❌ Before
// console.log('✅ User authenticated');

// ✅ After
debugLog('✅ [Background] User authenticated');
```

### Multi-Line Logs

```javascript
// ❌ Before
// console.log(
//   '🔍 Found items:',
//   items.length
// );

// ✅ After
debugLog('🔍 [Module] Found items:', items.length);
```

### Conditional Logs

```javascript
// ❌ Before
// console.log('Error:', error);

// ✅ After - Keep error logs!
console.error('[Module] Error:', error);
```

**Rule:** Only migrate debug logs, NOT error logs!

### Object Logging

```javascript
// ❌ Before
// console.log('User data:', { username, email });

// ✅ After
debugLog('👤 [Module] User data:', { username, email });
```

## Special Cases

### 1. Keep Error Logs
```javascript
// ✅ Keep as-is (not commented)
console.error('[Module] Critical error:', error);
console.warn('[Module] Warning:', message);
```

### 2. Remove Completely

Some logs can be removed entirely:

```javascript
// ❌ Remove these
// console.log('here');
// console.log('test');
// console.log(1);
```

### 3. Module Loaded Logs

```javascript
// ❌ Before
// console.log("✅ [MYM Module] Module loaded");

// ✅ After - Usually not needed
// Remove these unless debugging module loading
```

## Testing After Migration

### 1. Enable Debug Mode

```javascript
// config.js
const DEBUG = true; // Enable logging
```

### 2. Load Extension

Load the extension in Chrome/Firefox dev mode.

### 3. Check Console

You should see logs like:
```
🔍 [Badges] Fetching user info...
✅ [Stats] Stats box injected
📝 [Notes] Notes loaded
```

### 4. Disable Debug Mode

```javascript
// config.js
const DEBUG = false; // Disable for production
```

Reload extension - no debug logs should appear.

## Checklist

After migration, verify:

- [ ] No commented `// console.log` remain (except in comments explaining something)
- [ ] All `debugLog()` calls have module prefix
- [ ] Error/warn logs use `console.error/warn` (not debugLog)
- [ ] DEBUG mode works (logs appear when `DEBUG = true`)
- [ ] Production mode works (no logs when `DEBUG = false`)
- [ ] Extension functions normally with DEBUG = false
- [ ] Tests pass (when implemented)

## Common Mistakes

### ❌ Mistake 1: Forgot Module Prefix
```javascript
debugLog('Fetching data...'); // BAD
```

### ✅ Correct
```javascript
debugLog('🔍 [Badges] Fetching data...'); // GOOD
```

### ❌ Mistake 2: Migrated Error Logs
```javascript
debugLog('❌ Error:', error); // BAD - Won't show in production!
```

### ✅ Correct
```javascript
console.error('[Badges] Error:', error); // GOOD - Always visible
```

### ❌ Mistake 3: Multi-Line Not Collapsed
```javascript
debugLog(
  'User:',
  username
); // BAD - Unnecessary multi-line
```

### ✅ Correct
```javascript
debugLog('👤 [Module] User:', username); // GOOD - Single line
```

## Automated Verification

Add to your workflow:

```bash
# Check for remaining commented logs
npm run lint:check-logs

# Will fail if any // console.log found
```

Add to package.json:
```json
{
  "scripts": {
    "lint:check-logs": "grep -r '// console.log' --include='*.js' --exclude-dir=node_modules . && exit 1 || exit 0"
  }
}
```

## Git Commit

After migration:

```bash
git add .
git commit -m "refactor: migrate commented logs to debugLog helper

- Replaced all // console.log with debugLog()
- Added module prefixes for better debugging
- Kept error/warn logs as console.error/warn
- Verified DEBUG mode toggle works

BREAKING: None
Impact: Cleaner codebase, toggleable debug logs"
```

## Need Help?

- Check [CONTRIBUTING.md](./CONTRIBUTING.md) for code standards
- See [config.js](./config.js) for DEBUG configuration
- Open an issue if you find edge cases

---

**Estimated time:** 30-60 minutes for full codebase  
**Difficulty:** Easy  
**Impact:** High (code quality)
