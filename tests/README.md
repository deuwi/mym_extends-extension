# 🧪 Testing Guide for MYM Chat Live Extension

## Test Setup

### Installation

```bash
npm install --save-dev jest @types/chrome
```

### Test Structure

```
tests/
├── unit/
│   ├── core.test.js       # Core utilities tests
│   ├── badges.test.js     # Badge system tests
│   ├── cache.test.js      # LRU Cache tests
│   └── storage.test.js    # Chrome storage tests
├── integration/
│   ├── auth.test.js       # Authentication flow tests
│   └── api.test.js        # API integration tests
└── e2e/
    ├── popup.test.js      # Popup UI tests
    └── content.test.js    # Content script tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test tests/unit/core.test.js
```

## Test Examples

### Unit Test Example

```javascript
// tests/unit/cache.test.js
describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  test('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  test('should evict least recently used item when full', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4'); // Should evict key1
    
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key4')).toBe(true);
  });
});
```

### Integration Test Example

```javascript
// tests/integration/auth.test.js
describe('Authentication Flow', () => {
  test('should validate Firebase token', async () => {
    const mockToken = 'mock-firebase-token';
    const result = await validateToken(mockToken);
    
    expect(result.valid).toBe(true);
    expect(result.email).toBeDefined();
  });

  test('should reject expired token', async () => {
    const expiredToken = 'expired-token';
    const result = await validateToken(expiredToken);
    
    expect(result.valid).toBe(false);
  });
});
```

## Mocking Chrome APIs

```javascript
// __mocks__/chrome.js
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
  },
};
```

## Coverage Goals

- **Unit Tests:** > 80% coverage
- **Integration Tests:** Key user flows covered
- **E2E Tests:** Critical paths tested

## TODO: Tests to Implement

### High Priority
- [ ] LRU Cache implementation
- [ ] User category management
- [ ] Token validation logic
- [ ] Badge calculation
- [ ] Storage operations

### Medium Priority
- [ ] Emoji picker functionality
- [ ] Notes system
- [ ] Conversation list
- [ ] Keyboard shortcuts

### Low Priority
- [ ] UI components
- [ ] Styling
- [ ] Animation timing

## Continuous Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

## Manual Testing Checklist

### Before Each Release

- [ ] Test Chrome installation (unpacked)
- [ ] Test Firefox installation (temporary)
- [ ] Test authentication flow
- [ ] Test subscription check
- [ ] Test all feature toggles
- [ ] Test on different screen sizes
- [ ] Test with slow network (throttling)
- [ ] Test token expiration
- [ ] Test offline mode

### Feature-Specific Tests

**Badges:**
- [ ] Revenue badges display correctly
- [ ] Category badges (TW/SP/Whale) work
- [ ] Cache invalidation works
- [ ] Badge refresh works

**Notes:**
- [ ] Notes save correctly
- [ ] Templates work
- [ ] Sync to backend works
- [ ] Notes load on page change

**Emoji Picker:**
- [ ] All emojis display
- [ ] Recently used tracking works
- [ ] Insertion into textarea works
- [ ] Picker closes on outside click

**Conversations List:**
- [ ] Search filters correctly
- [ ] Pagination works
- [ ] Real-time updates work
- [ ] Navigation works

## Performance Testing

```javascript
// Measure function performance
console.time('fetchUserInfo');
await fetchUserInfo(username);
console.timeEnd('fetchUserInfo');

// Check memory usage
console.memory.usedJSHeapSize / 1048576; // MB
```

## Debugging Tips

1. **Enable DEBUG mode** in `config.js`
2. **Use Chrome DevTools** for service worker
3. **Check console logs** in content script
4. **Monitor network tab** for API calls
5. **Use Performance tab** for optimization
6. **Check Application tab** for storage

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Chrome Extension Testing](https://developer.chrome.com/docs/extensions/mv3/tut_testing/)
- [Testing Best Practices](https://testingjavascript.com/)
