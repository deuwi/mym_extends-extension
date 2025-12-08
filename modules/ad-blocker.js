/**
 * Ad Blocker Module
 * Removes advertising banners from conversation pages
 * 
 * @module modules/ad-blocker
 * @requires config.js
 */

(function () {
  "use strict";

  var debugLog = (window.APP_CONFIG && window.APP_CONFIG.debugLog) || function() {};

  /**
   * Configuration for ad blocking
   */
  var AD_CONFIG = {
    // CSS selectors for ad elements to remove
    selectors: [
      'details.ad-banner',           // Main ad banner container
      '.ad-banner',                  // Generic ad banner class
      '[class*="ad-banner"]',        // Any class containing "ad-banner"
      '[id*="advertisement"]',       // IDs containing "advertisement"
    ],
    
    // Debounce delay for mutation observer (ms)
    debounceDelay: 100,
    
    // Maximum retries for removing persistent ads
    maxRetries: 5,
  };

  /**
   * Statistics for blocked ads
   */
  var stats = {
    blocked: 0,
    lastCheck: null,
  };

  /**
   * Check if element is actually an ad
   * @param {HTMLElement} el - Element to check
   * @returns {boolean} True if element is an ad
   */
  var checkIsAd = function(el) {
    if (!el) return false;
    
    // Check class names
    var className = el.className;
    if (className && typeof className === 'string') {
      if (className.indexOf('ad-banner') !== -1) return true;
      if (className.indexOf('advertisement') !== -1) return true;
    }

    // Check ID
    var elId = el.id;
    if (elId && elId.indexOf('advertisement') !== -1) return true;

    // Check for ad-specific attributes
    if (el.hasAttribute && el.hasAttribute('data-track-event-name')) {
      var trackEvent = el.getAttribute('data-track-event-name');
      if (trackEvent && trackEvent.indexOf('banner') !== -1) return true;
    }

    // Check for ad content (MYM-specific)
    if (el.querySelector) {
      var summary = el.querySelector('summary.ad-banner__header');
      if (summary) return true;
    }

    return false;
  };

  /**
   * Remove all ad banners from the page
   * @returns {number} Number of ads removed
   */
  function removeAdBanners() {
    var removed = 0;
    var selectors = AD_CONFIG.selectors;

    for (var i = 0; i < selectors.length; i++) {
      var selector = selectors[i];
      try {
        var elements = document.querySelectorAll(selector);
        for (var j = 0; j < elements.length; j++) {
          var element = elements[j];
          // Verify it's actually an ad
          if (checkIsAd(element)) {
            debugLog('🚫 [AdBlocker] Removing ad banner: ' + selector);
            element.remove();
            removed++;
          }
        }
      } catch (error) {
        console.error('[AdBlocker] Error with selector "' + selector + '":', error);
      }
    }

    if (removed > 0) {
      stats.blocked += removed;
      stats.lastCheck = new Date().toISOString();
      debugLog('🚫 [AdBlocker] Removed ' + removed + ' ad(s). Total: ' + stats.blocked);
    }

    return removed;
  }

  /**
   * Debounce function to limit execution frequency
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {Function} Debounced function
   */
  var debounce = function(func, wait) {
    var timeout;
    return function() {
      var args = arguments;
      var later = function() {
        clearTimeout(timeout);
        func.apply(null, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  /**
   * Setup MutationObserver to watch for new ads
   * Ads might be injected dynamically during scrolling or navigation
   */
  function setupMutationObserver() {
    // Debounced removal function
    var debouncedRemove = debounce(function() {
      removeAdBanners();
    }, AD_CONFIG.debounceDelay);

    var observer = new MutationObserver(function(mutations) {
      var hasNewAds = false;

      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        // Check added nodes
        if (mutation.addedNodes.length > 0) {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType === 1) { // ELEMENT_NODE
              // Check if added node is an ad or contains ads
              if (node.matches) {
                for (var k = 0; k < AD_CONFIG.selectors.length; k++) {
                  try {
                    if (node.matches(AD_CONFIG.selectors[k])) {
                      hasNewAds = true;
                      break;
                    }
                  } catch (e) {
                    // Invalid selector, skip
                  }
                }
              }
              
              // Check if added node contains ads
              if (node.querySelector && !hasNewAds) {
                for (var m = 0; m < AD_CONFIG.selectors.length; m++) {
                  try {
                    if (node.querySelector(AD_CONFIG.selectors[m])) {
                      hasNewAds = true;
                      break;
                    }
                  } catch (e) {
                    // Invalid selector, skip
                  }
                }
              }
            }
          }
        }
      }

      if (hasNewAds) {
        debugLog('🚫 [AdBlocker] New ads detected, removing...');
        debouncedRemove();
      }
    });

    // Observe entire document for changes
    observer.observe(document.body, {
      childList: true,      // Watch for added/removed nodes
      subtree: true,        // Watch all descendants
    });

    debugLog('👀 [AdBlocker] MutationObserver active');
    return observer;
  }

  /**
   * Initialize ad blocker
   */
  function init() {
    debugLog('🚫 [AdBlocker] Initializing ad blocker...');

    // Immediate cleanup - run as soon as possible
    var initialRemoved = removeAdBanners();
    
    if (initialRemoved > 0) {
      debugLog('🚫 [AdBlocker] Initial cleanup: ' + initialRemoved + ' ad(s) removed');
    }

    // Setup observer for dynamic ads
    setupMutationObserver();

    // More aggressive periodic checks
    setInterval(function() {
      removeAdBanners();
    }, 1000); // Check every second for better coverage

    // Also check on visibility change (tab focus)
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        removeAdBanners();
      }
    });

    debugLog('✅ [AdBlocker] Ad blocker initialized');
  }

  /**
   * Get blocking statistics
   * @returns {Object} Statistics object
   */
  function getStats() {
    return {
      blocked: stats.blocked,
      lastCheck: stats.lastCheck,
      enabled: true,
    };
  }

  // Run immediately - don't wait for anything
  // First attempt: remove any existing ads
  removeAdBanners();
  
  // Initialize when possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
    // Also try on interactive state
    document.addEventListener('readystatechange', function() {
      if (document.readyState === 'interactive' || document.readyState === 'complete') {
        removeAdBanners();
      }
    });
  } else {
    init();
  }

  // Export public API
  window.MYMAdBlocker = {
    init,
    removeAdBanners,
    getStats,
  };

  debugLog('✅ [AdBlocker] Module loaded');
})();
