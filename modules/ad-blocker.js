/**
 * Ad Blocker Module
 * Removes advertising banners from conversation pages
 * 
 * @module modules/ad-blocker
 * @requires config.js
 */

(function () {
  "use strict";

  const { debugLog } = window.APP_CONFIG || {};

  /**
   * Configuration for ad blocking
   */
  const AD_CONFIG = {
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
  const stats = {
    blocked: 0,
    lastCheck: null,
  };

  /**
   * Remove all ad banners from the page
   * @returns {number} Number of ads removed
   */
  function removeAdBanners() {
    let removed = 0;

    AD_CONFIG.selectors.forEach((selector) => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element) => {
          // Verify it's actually an ad (check for ad-related attributes)
          if (isAdElement(element)) {
            debugLog(`🚫 [AdBlocker] Removing ad banner: ${selector}`);
            element.remove();
            removed++;
          }
        });
      } catch (error) {
        console.error(`[AdBlocker] Error with selector "${selector}":`, error);
      }
    });

    if (removed > 0) {
      stats.blocked += removed;
      stats.lastCheck = new Date().toISOString();
      debugLog(`🚫 [AdBlocker] Removed ${removed} ad(s). Total: ${stats.blocked}`);
    }

    return removed;
  }

  /**
   * Check if element is actually an ad
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element is an ad
   */
  function isAdElement(element) {
    // Check class names
    if (element.className && typeof element.className === 'string') {
      if (element.className.includes('ad-banner')) return true;
      if (element.className.includes('advertisement')) return true;
    }

    // Check ID
    if (element.id) {
      if (element.id.includes('advertisement')) return true;
    }

    // Check for ad-specific attributes
    if (element.hasAttribute('data-track-event-name')) {
      const trackEvent = element.getAttribute('data-track-event-name');
      if (trackEvent && trackEvent.includes('banner')) return true;
    }

    // Check for ad content (MYM-specific)
    const summary = element.querySelector('summary.ad-banner__header');
    if (summary) return true;

    return false;
  }

  /**
   * Debounce function to limit execution frequency
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {Function} Debounced function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Setup MutationObserver to watch for new ads
   * Ads might be injected dynamically during scrolling or navigation
   */
  function setupMutationObserver() {
    // Debounced removal function
    const debouncedRemove = debounce(() => {
      removeAdBanners();
    }, AD_CONFIG.debounceDelay);

    const observer = new MutationObserver((mutations) => {
      let hasNewAds = false;

      for (const mutation of mutations) {
        // Check added nodes
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if added node is an ad or contains ads
              if (node.matches && AD_CONFIG.selectors.some(s => {
                try { return node.matches(s); } catch { return false; }
              })) {
                hasNewAds = true;
              }
              
              // Check if added node contains ads
              if (node.querySelector) {
                AD_CONFIG.selectors.forEach((selector) => {
                  try {
                    if (node.querySelector(selector)) {
                      hasNewAds = true;
                    }
                  } catch (error) {
                    // Invalid selector, skip
                  }
                });
              }
            }
          });
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

    // Initial cleanup
    const initialRemoved = removeAdBanners();
    
    if (initialRemoved > 0) {
      debugLog(`🚫 [AdBlocker] Initial cleanup: ${initialRemoved} ad(s) removed`);
    }

    // Setup observer for dynamic ads
    setupMutationObserver();

    // Periodic check (backup for missed mutations)
    setInterval(() => {
      removeAdBanners();
    }, 5000); // Check every 5 seconds

    debugLog('✅ [AdBlocker] Ad blocker initialized');
  }

  /**
   * Get blocking statistics
   * @returns {Object} Statistics object
   */
  function getStats() {
    return {
      ...stats,
      enabled: true,
    };
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
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
