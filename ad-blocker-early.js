/**
 * Ad Blocker - Early Injection Script
 * Runs at document_start to block ads before they appear
 * This is the FIRST script that runs, even before the DOM
 */

(function() {
  'use strict';
  
  // Silent mode - no console logs in production
  var DEBUG = false;
  var log = function() {
    if (DEBUG) {
      console.log.apply(console, arguments);
    }
  };
  
  log('🚫 [AdBlocker-Early] Starting early ad blocker...');
  
  // ========================================
  // UTILITY: DEBOUNCE
  // ========================================
  var debounce = function(func, wait) {
    var timeout;
    return function() {
      var context = this;
      var args = arguments;
      var later = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };
  
  // Aggressive removal function
  var removeAds = function() {
    let removed = 0;
    const selectors = [
      'details.ad-banner',
      'details[class*="ad-banner"]',
      '.ad-banner',
      '[class*="ad-banner"]',
      '[id*="advertisement"]',
    ];
    
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          // Double-check it's an ad
          if (el.className?.includes?.('ad-banner') || 
              el.id?.includes?.('advertisement') ||
              el.tagName === 'DETAILS' && el.className?.includes?.('ad-banner')) {
            el.remove();
            removed++;
          }
        });
      } catch (e) {
        // Selector might not work yet, ignore
      }
    });
    
    return removed;
  };
  
  // Run immediately
  removeAds();
  
  // Debounced check for ads
  var checkAndRemoveAds = debounce(function() {
    var removed = removeAds();
    if (removed > 0) {
      log('🚫 [AdBlocker-Early] Blocked ' + removed + ' ad(s)');
    }
  }, 100);
  
  // Run on every state change
  var observer = new MutationObserver(function(mutations) {
    var hasAds = mutations.some(function(m) {
      return Array.from(m.addedNodes).some(function(node) {
        return node.nodeType === 1 && (
          node.classList && node.classList.contains('ad-banner') ||
          node.className && node.className.indexOf && node.className.indexOf('ad-banner') !== -1 ||
          node.querySelector && node.querySelector('.ad-banner, details.ad-banner')
        );
      });
    });
    
    if (hasAds) {
      checkAndRemoveAds();
    }
  });
  
  // Start observing as soon as <html> exists
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true, // Required for early injection to catch all ads
    });
  }
  
  // Keep checking aggressively for first 10 seconds
  let checkCount = 0;
  const maxChecks = 50; // 50 checks * 200ms = 10 seconds
  var earlyInterval = setInterval(function() {
    var removed = removeAds();
    if (removed > 0) {
      log('🚫 [AdBlocker-Early] Periodic check removed ' + removed + ' ad(s)');
    }
    checkCount++;
    if (checkCount >= maxChecks) {
      clearInterval(earlyInterval);
      log('🚫 [AdBlocker-Early] Early blocking phase complete');
    }
  }, 200); // Every 200ms for first 10 seconds
  
  log('✅ [AdBlocker-Early] Early blocker initialized');
})();
