/**
 * Keyboard Shortcuts Module
 * Adds Ctrl+Enter shortcut to send messages quickly
 */

(function (contentAPI) {
  "use strict";

  if (!contentAPI) {
    console.error("❌ [MYM Keyboard] contentAPI not available");
    return;
  }

  let setupTextareas = new Set();

  // ========================================
  // SETUP CTRL+ENTER SHORTCUT
  // ========================================
  function setupCtrlEnterShortcut() {
    const chatInputs = document.querySelectorAll(".chat-input__input textarea");

    chatInputs.forEach((textarea) => {
      // Skip if already setup
      if (setupTextareas.has(textarea)) return;
      setupTextareas.add(textarea);

      // Add tooltip on hover
      const parentDiv = textarea.closest(".input__field");
      if (parentDiv && !parentDiv.querySelector(".mym-ctrlenter-tooltip")) {
        parentDiv.style.position = "relative";

        const tooltip = document.createElement("div");
        tooltip.className = "mym-ctrlenter-tooltip";
        tooltip.textContent = "Ctrl+Entrée pour envoyer";
        tooltip.style.cssText = `
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.85);
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          margin-bottom: 8px;
          z-index: 10000;
        `;

        parentDiv.appendChild(tooltip);

        textarea.addEventListener("mouseenter", () => {
          tooltip.style.opacity = "1";
        });

        textarea.addEventListener("mouseleave", () => {
          tooltip.style.opacity = "0";
        });
      }

      // Add Ctrl+Enter handler
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();

          // Find the send button
          const chatInput = textarea.closest(".chat-input");
          if (chatInput) {
            const sendButton = chatInput.querySelector(".chat-input__send");
            if (sendButton && !sendButton.disabled) {
              // console.log("⌨️ [MYM Keyboard] Ctrl+Enter pressed, sending message");
              sendButton.click();
            }
          }
        }
      });
    });
  }

  // ========================================
  // OBSERVER FOR NEW INPUTS
  // ========================================
  let inputObserver = null;
  let inputObserverTimeout = null;

  function observeNewInputs() {
    if (inputObserver) return;

    inputObserver = new MutationObserver(() => {
      if (inputObserverTimeout) return;
      inputObserverTimeout = setTimeout(() => {
        setupCtrlEnterShortcut();
        inputObserverTimeout = null;
      }, 500); // Throttle 500ms
    });

    inputObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ========================================
  // CLEANUP
  // ========================================
  function cleanup() {
    if (inputObserver) {
      inputObserver.disconnect();
      inputObserver = null;
    }
    setupTextareas.clear();
    // console.log("🧹 [MYM Keyboard] Cleanup completed");
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  function init() {
    // console.log("🚀 [MYM Keyboard] Module initializing...");

    // Setup existing inputs
    setTimeout(setupCtrlEnterShortcut, 1000);

    // Observe for new inputs
    observeNewInputs();

    // Cleanup on page unload
    window.addEventListener("beforeunload", cleanup);
  }

  // Exposer dans l'API
  contentAPI.keyboard = {
    setupCtrlEnterShortcut,
    cleanup,
    init,
  };

  // console.log("✅ [MYM Keyboard] Module loaded");
})(window.MYM_CONTENT_API);
