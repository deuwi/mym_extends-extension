// sidebar-toggle.js - Module pour afficher/masquer le sidebar en mode mobile
(function () {
  "use strict";

  // API centrale pour les modules
  window.MYM_CONTENT_API = window.MYM_CONTENT_API || {};
  const contentAPI = window.MYM_CONTENT_API;

  let sidebarVisible = false;

  // Use shared utilities from API
  const debounce = contentAPI.debounce;
  const SELECTORS = contentAPI.SELECTORS;
  const CleanupManager = contentAPI.CleanupManager;

  // Cleanup tracking
  let buttonObserver = null;

  /**
   * Create and inject the sidebar toggle button
   */
  function createSidebarToggleButton() {
    if (APP_CONFIG.DEBUG) console.log("📱 Creating sidebar toggle button...");

    // Don't inject on /app/myms page
    if (window.location.pathname === "/app/myms") {
      if (APP_CONFIG.DEBUG) console.log("📱 On /app/myms page, skipping sidebar toggle");
      return;
    }

    // Check if button already exists
    if (document.getElementById("mym-sidebar-toggle")) {
      if (APP_CONFIG.DEBUG) console.log("📱 Button already exists, skipping");
      return;
    }

    const button = document.createElement("button");
    button.id = "mym-sidebar-toggle";
    button.type = "button";
    button.className = "button button--icon button--secondary";
    button.title = "Afficher le menu";
    button.style.cssText = `
      margin-right: 8px;
      display: inline-flex;
      font-size: 20px;
      background: linear-gradient(135deg, rgb(95, 95, 95) 0%, rgb(29, 29, 29) 100%); 
      border-radius: 50%; width: 28px; 
      border: none;
      height: 28px; 
      padding: 0px; 
      font-size: 20px; 
      cursor: pointer; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      box-shadow: rgba(0, 0, 0, 0.1) 0px 2px 4px; 
      transition: 0.2s; 
      z-index: 1000; 
      transform: scale(1);
    `;

    button.innerHTML = `
      <span class="button__icon">☰</span>
    `;

    button.addEventListener("click", toggleSidebar);

    // Find the list__row__left container
    const listRowLeft = document.querySelector(".list__row__left");
    if (APP_CONFIG.DEBUG) console.log("📱 Searching for .list__row__left:", listRowLeft ? "FOUND" : "NOT FOUND");

    if (listRowLeft) {
      // Insert after the back button
      const backButton = listRowLeft.querySelector(SELECTORS.LIST_ROW_LEFT_BACK);
      if (APP_CONFIG.DEBUG) console.log("📱 Back button found:", backButton ? "YES" : "NO");

      if (backButton && backButton.nextSibling) {
        listRowLeft.insertBefore(button, backButton.nextSibling);
        if (APP_CONFIG.DEBUG) console.log("✅ Button inserted after back button");
      } else {
        listRowLeft.insertBefore(button, listRowLeft.firstChild);
        if (APP_CONFIG.DEBUG) console.log("✅ Button inserted at start of list__row__left");
      }
      if (APP_CONFIG.DEBUG) console.log("✅ Sidebar toggle button injected in list__row__left");

      // Check visibility after insertion
      setTimeout(() => {
        checkButtonVisibility();
      }, 100);
    } else {
      console.warn("⚠️ list__row__left not found, will retry...");
    }
  }

  /**
   * Check if button should be visible based on aside visibility
   */
  function checkButtonVisibility() {
    const button = document.getElementById("mym-sidebar-toggle");
    const aside = document.querySelector("aside.sidebar");

    if (!button || !aside) return;

    const asideDisplay = window.getComputedStyle(aside).display;

    // Show button only when aside is hidden (display: none)
    if (asideDisplay === "none") {
      button.style.display = "inline-flex";
      if (APP_CONFIG.DEBUG) console.log("📱 Sidebar toggle visible (aside hidden)");
    } else {
      button.style.display = "none";
      if (APP_CONFIG.DEBUG) console.log("📱 Sidebar toggle hidden (aside visible)");
    }
  }

  /**
   * Toggle sidebar visibility
   */
  function toggleSidebar() {
    const aside = document.querySelector("aside.sidebar");
    if (!aside) return;

    sidebarVisible = !sidebarVisible;

    if (sidebarVisible) {
      // Show sidebar in mobile mode with overlay
      aside.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        left: auto !important;
        width: 80% !important;
        max-width: 400px !important;
        height: 100vh !important;
        display: flex !important;
        flex-direction: column !important;
        z-index: 9999 !important;
        background: rgba(30, 33, 42, 0.85) !important;
        backdrop-filter: blur(15px) !important;
        -webkit-backdrop-filter: blur(15px) !important;
        overflow-y: auto !important;
        box-shadow: -4px 0 12px rgba(0, 0, 0, 0.5) !important;
      `;

      // Style the sidebar content for mobile
      const sidebarContent = aside.querySelector(".sidebar__content");
      if (sidebarContent) {
        sidebarContent.style.cssText = `
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          padding: 20px !important;
        `;
      }

      // Update button icon
      const button = document.getElementById("mym-sidebar-toggle");
      if (button) {
        button.querySelector(".button__icon").textContent = "✕";
        button.title = "Masquer le menu";
      }

      // Add overlay behind the sidebar
      createOverlay();
    } else {
      // Hide sidebar and restore original styles
      aside.style.cssText = "";

      const sidebarContent = aside.querySelector(".sidebar__content");
      if (sidebarContent) {
        sidebarContent.style.cssText = "";
      }

      // Update button icon
      const button = document.getElementById("mym-sidebar-toggle");
      if (button) {
        button.querySelector(".button__icon").textContent = "☰";
        button.title = "Afficher le menu";
      }

      // Remove overlay
      removeOverlay();
    }
  }

  /**
   * Create overlay to close sidebar
   */
  function createOverlay() {
    if (document.getElementById("mym-sidebar-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "mym-sidebar-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 9998;
      cursor: pointer;
      backdrop-filter: blur(5px);
    `;

    overlay.addEventListener("click", () => {
      sidebarVisible = true; // Set to true so toggleSidebar will hide it
      toggleSidebar();
    });

    document.body.appendChild(overlay);
  }

  /**
   * Remove overlay
   */
  function removeOverlay() {
    const overlay = document.getElementById("mym-sidebar-overlay");
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Initialize the sidebar toggle
   */
  function init() {
    if (APP_CONFIG.DEBUG) console.log("📱 Sidebar Toggle: Initializing...");

    // Try immediate injection
    setTimeout(() => {
      createSidebarToggleButton();
    }, 500);

    // Listen for window resize to show/hide button with debounce
    const debouncedCheckVisibility = debounce(checkButtonVisibility, 150);
    window.addEventListener("resize", debouncedCheckVisibility);

    // Observe for navigation changes and retry injection with debounce
    const checkButtonInjection = debounce(() => {
      // Don't observe on /app/myms
      if (window.location.pathname === "/app/myms") {
        return;
      }

      const button = document.getElementById("mym-sidebar-toggle");
      const listRowLeft = document.querySelector(SELECTORS.LIST_ROW_LEFT);

      // If no button but list__row__left exists, inject it
      if (!button && listRowLeft) {
        if (APP_CONFIG.DEBUG) console.log("📱 Detected list__row__left, injecting button...");
        createSidebarToggleButton();
      }
    }, 200);

    if (buttonObserver) {
      CleanupManager.disconnectObserver(buttonObserver);
    }
    buttonObserver = CleanupManager.registerObserver(new MutationObserver(checkButtonInjection));

    buttonObserver.observe(document.body, {
      childList: true,
      subtree: false, // Limit to direct children for performance
    });

    if (APP_CONFIG.DEBUG) console.log("✅ Sidebar Toggle: Initialized");
  }

  // Cleanup function
  function cleanup() {
    if (buttonObserver) {
      CleanupManager.disconnectObserver(buttonObserver);
      buttonObserver = null;
    }
  }

  // Export public API
  contentAPI.sidebarToggle = {
    init,
    cleanup,
  };

  if (APP_CONFIG.DEBUG) console.log("✅ [MYM Sidebar Toggle] Module loaded");
})();
