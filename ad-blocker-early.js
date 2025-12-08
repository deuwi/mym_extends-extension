/**
 * Ad Blocker - Early Injection Script
 * Runs at document_start to block ads before they appear
 * This is the FIRST script that runs, even before the DOM
 */

(function() {
  'use strict';
  
  console.log('🚫 [AdBlocker-Early] Starting early ad blocker...');
  
  // Aggressive removal function
  const removeAds = () => {
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
  
  // Run on every state change
  const observer = new MutationObserver((mutations) => {
    const hasAds = mutations.some(m => 
      Array.from(m.addedNodes).some(node => 
        node.nodeType === 1 && (
          node.classList?.contains('ad-banner') ||
          node.className?.includes?.('ad-banner') ||
          node.querySelector?.('.ad-banner, details.ad-banner')
        )
      )
    );
    
    if (hasAds) {
      const removed = removeAds();
      if (removed > 0) {
        console.log(`🚫 [AdBlocker-Early] Blocked ${removed} ad(s)`);
      }
    }
  });
  
  // Start observing as soon as <html> exists
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  
  // Keep checking aggressively for first 10 seconds
  let checkCount = 0;
  const maxChecks = 50; // 50 checks * 200ms = 10 seconds
  const earlyInterval = setInterval(() => {
    const removed = removeAds();
    if (removed > 0) {
      console.log(`🚫 [AdBlocker-Early] Periodic check removed ${removed} ad(s)`);
    }
    checkCount++;
    if (checkCount >= maxChecks) {
      clearInterval(earlyInterval);
      console.log('🚫 [AdBlocker-Early] Early blocking phase complete');
    }
  }, 200); // Every 200ms for first 10 seconds
  
  console.log('✅ [AdBlocker-Early] Early blocker initialized');
})();
