# 🤝 Contributing to MYM Chat Live Extension

Thank you for considering contributing to this project! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help maintain a positive environment
- Report any inappropriate behavior

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm
- Chrome or Firefox browser
- Git
- Basic knowledge of JavaScript and browser extensions

### Setup Development Environment

1. **Clone the repository**
   ```bash
   git clone https://github.com/deuwi/mym_extends-extension.git
   cd mym_extends-extension/extension
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```javascript
   // In config.js, set ENVIRONMENT to "local"
   const ENVIRONMENT = "local";
   const DEBUG = true; // Enable debug logging
   ```

4. **Load extension in browser**

   **Chrome:**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

   **Firefox:**
   - Run `.\build-firefox.ps1`
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json` in `build-firefox` folder

## 🔄 Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-new-feature
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

- Follow the [Coding Standards](#coding-standards)
- Write clean, documented code
- Test your changes thoroughly
- Update documentation if needed

### 3. Test Locally

```bash
# Run tests (when implemented)
npm test

# Build for production
.\build-chrome.ps1
.\build-firefox.ps1
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

### 5. Push and Create PR

```bash
git push origin feature/my-new-feature
```

Then create a Pull Request on GitHub.

## 📝 Coding Standards

### JavaScript Style Guide

#### Variables and Constants

```javascript
// ✅ Good
const MAX_RETRY_COUNT = 3;
const userName = 'john';
let isEnabled = false;

// ❌ Bad
var user_name = 'john';
const max_count = 3;
```

#### Functions

```javascript
// ✅ Good - JSDoc comments
/**
 * Fetches user information from the API
 * @param {string} username - The username to fetch
 * @returns {Promise<Object>} User information object
 */
async function fetchUserInfo(username) {
  // Implementation
}

// ❌ Bad - No documentation
function getUserInfo(u) {
  // ...
}
```

#### Async/Await vs Promises

```javascript
// ✅ Good - Use async/await
async function loadData() {
  try {
    const data = await fetchData();
    return processData(data);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ❌ Bad - Promise chains
function loadData() {
  return fetchData()
    .then(data => processData(data))
    .catch(error => console.error(error));
}
```

#### Error Handling

```javascript
// ✅ Good
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('[Module] Operation failed:', error);
  return null;
}

// ❌ Bad - Silent failures
try {
  await riskyOperation();
} catch (e) {
  // Nothing
}
```

### Module Structure

```javascript
/**
 * @module moduleName
 * @description Brief description of module purpose
 */

(function (contentAPI) {
  "use strict";

  // Private variables
  let privateVar = null;

  /**
   * Private helper function
   * @private
   */
  function privateHelper() {
    // Implementation
  }

  /**
   * Public function
   * @public
   */
  function publicFunction() {
    // Implementation
  }

  // Export public API
  contentAPI.moduleName = {
    publicFunction,
  };

})(window.MYM_CONTENT_API);
```

### Logging Guidelines

```javascript
// ✅ Good - Use debugLog helper
debugLog('🔍 [Module] Searching for items...');

// ❌ Bad - Direct console.log (unless critical error)
console.log('searching...');

// ✅ Good - Structured error logging
console.error('[Module] Critical error:', {
  username,
  error: error.message,
  stack: error.stack,
});
```

### Configuration Usage

```javascript
// ✅ Good - Use APP_CONFIG
const API_URL = APP_CONFIG.API_BASE + '/endpoint';
const retryCount = APP_CONFIG.MAX_RETRY_COUNT;

// ❌ Bad - Hardcoded values
const API_URL = 'https://mymchat.fr/api/endpoint';
const retryCount = 3;
```

## 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

### Examples

```bash
feat(badges): add category filtering for revenue badges

- Add TW/SP/Whale category support
- Implement color coding for categories
- Update badge UI with new design

Closes #42

---

fix(auth): prevent token validation loop

The token refresh was triggering multiple validations.
Added cooldown timer to prevent duplicate checks.

Fixes #128

---

docs(README): update installation instructions

Added screenshots and clarified Firefox setup steps.
```

## 🔄 Pull Request Process

### Before Submitting

1. **Update your branch**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run tests**
   ```bash
   npm test
   npm run lint
   ```

3. **Build successfully**
   ```bash
   .\build-chrome.ps1
   .\build-firefox.ps1
   ```

### PR Checklist

- [ ] Code follows style guidelines
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] No console.log statements (use debugLog)
- [ ] No hardcoded URLs (use APP_CONFIG)
- [ ] Screenshots/GIFs for UI changes
- [ ] Tested on Chrome and Firefox
- [ ] No breaking changes (or clearly documented)

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested your changes

## Screenshots
If applicable, add screenshots

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests
- [ ] All tests pass
```

## 🧪 Testing

### Writing Tests

```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  test('should do something', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Test Coverage

- Aim for >80% code coverage
- Test edge cases and error conditions
- Mock external dependencies

## 📚 Documentation

### Code Documentation

- Use JSDoc for all public functions
- Include parameter types and return types
- Provide usage examples for complex functions

### README Updates

- Keep README.md up to date
- Document new features
- Update configuration examples

### Module Documentation

Each module should have:
- Purpose description
- Public API documentation
- Usage examples
- Dependencies listed

## 🐛 Reporting Bugs

### Bug Report Template

```markdown
**Description:**
Clear description of the bug

**Steps to Reproduce:**
1. Step one
2. Step two
3. ...

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Environment:**
- Browser: Chrome/Firefox
- Version: X.X.X
- OS: Windows/Mac/Linux

**Screenshots:**
If applicable

**Additional Context:**
Any other relevant information
```

## 💡 Feature Requests

### Feature Request Template

```markdown
**Feature Description:**
Clear description of the feature

**Use Case:**
Why is this feature needed?

**Proposed Solution:**
How should it work?

**Alternatives Considered:**
Other approaches you've thought about

**Additional Context:**
Mockups, examples, etc.
```

## 📞 Contact

- **GitHub Issues:** For bugs and features
- **Email:** contact@mymchat.fr
- **Documentation:** Check the README and module docs

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing! 🎉
