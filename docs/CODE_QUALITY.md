# 🔧 Code Quality Tools

## Overview

This document explains the code quality tools configured for the MYM Chat Live extension.

## Tools Configured

### 1. ESLint (Linting)

**Purpose:** Enforces code quality and consistency.

**Configuration:** `.eslintrc.js`

```bash
# Check for linting errors
npm run lint

# Auto-fix issues
npm run lint:fix
```

**Key Rules:**
- `no-console`: Warn on console.log (use debugLog instead)
- `no-unused-vars`: Warn on unused variables
- `prefer-const`: Require const for variables never reassigned
- `no-var`: Disallow var (use let/const)
- `eqeqeq`: Require === instead of ==

### 2. Prettier (Formatting)

**Purpose:** Automatic code formatting.

**Configuration:** `.prettierrc.json`

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

**Settings:**
- Semi-colons: Yes
- Quotes: Double quotes
- Print width: 100 characters
- Tab width: 2 spaces
- Trailing commas: Yes

### 3. Jest (Testing)

**Purpose:** Unit testing framework.

**Configuration:** `package.json` (jest section)

```bash
# Run all tests
npm test

# Watch mode (re-run on changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test Files:** `tests/unit/*.test.js`

### 4. Log Migration Tool

**Purpose:** Migrate commented console.log to debugLog.

**Script:** `scripts/migrate-logs.js`

```bash
# Preview changes
npm run migrate:logs:preview

# Apply migration
npm run migrate:logs:apply

# Verify no commented logs remain
npm run lint:logs
```

## Workflow

### Before Committing

1. **Format code:**
   ```bash
   npm run format
   ```

2. **Check linting:**
   ```bash
   npm run lint:fix
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

4. **Verify build:**
   ```bash
   npm run build
   ```

### Pre-Build Hook

The `prebuild` script automatically runs linting before building:

```bash
npm run build
# Automatically runs: npm run lint → build:chrome → build:firefox
```

## IDE Integration

### VS Code

Install extensions:
- **ESLint** (dbaeumer.vscode-eslint)
- **Prettier** (esbenp.prettier-vscode)

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.validate": ["javascript"],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Common Issues

### Issue: ESLint warns about console.log

**Solution:** Use `debugLog()` for debug logs, `console.error/warn` for errors.

```javascript
// ❌ Wrong
console.log('Debug info');

// ✅ Correct
debugLog('🔍 [Module] Debug info');
console.error('[Module] Error:', error);
```

### Issue: Prettier conflicts with ESLint

**Solution:** Prettier and ESLint are configured to work together. Run:

```bash
npm run format && npm run lint:fix
```

### Issue: Tests failing

**Solution:** Check test output and fix issues. Tests should pass before committing.

```bash
npm test -- --verbose
```

## Code Quality Metrics

After setup, you should achieve:

- ✅ **0 ESLint errors**
- ✅ **0 commented console.log**
- ✅ **Consistent formatting**
- ✅ **Tests passing**
- ✅ **Build succeeds**

## Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines
- **[MIGRATION_LOGS.md](./docs/MIGRATION_LOGS.md)** - Log migration guide
- **[tests/README.md](./tests/README.md)** - Testing guide

## Resources

- [ESLint Rules](https://eslint.org/docs/rules/)
- [Prettier Options](https://prettier.io/docs/en/options.html)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

---

**Questions?** Open an issue or check the documentation.
