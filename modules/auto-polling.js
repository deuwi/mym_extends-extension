/**
 * Auto-Polling Module
 * Automatically refreshes messages and updates conversation list
 */

(function (contentAPI) {
  "use strict";

  if (!contentAPI) {
    console.error("❌ [MYM Polling] contentAPI not available");
    return;
  }

  const POLL_INTERVAL_MS = 10000; // 10 seconds
  const POLL_INTERVAL_BACKGROUND_MS = 30000; // 30 seconds when tab is hidden

  let pollingInterval = null;
  let lastPollTime = 0;
  let isTabVisible = true;

  // ========================================
  // MESSAGE INJECTION
  // ========================================
  function injectNewMessages(newMessagesHTML) {
    const chatContainer = document.querySelector(".chat__content");
    if (!chatContainer) return;

    // Create temporary container to parse new HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = newMessagesHTML;

    const newMessages = tempDiv.querySelectorAll(".chat__message");
    const existingMessages = chatContainer.querySelectorAll(".chat__message");

    // Get IDs of existing messages
    const existingIds = new Set();
    existingMessages.forEach((msg) => {
      const id = msg.getAttribute("data-message-id");
      if (id) existingIds.add(id);
    });

    // Inject only new messages
    let injectedCount = 0;
    newMessages.forEach((msg) => {
      const id = msg.getAttribute("data-message-id");
      if (id && !existingIds.has(id)) {
        // Add animation class
        msg.style.opacity = "0";
        msg.style.transform = "translateY(10px)";
        msg.style.transition = "opacity 0.3s, transform 0.3s";

        chatContainer.appendChild(msg);

        // Trigger animation
        setTimeout(() => {
          msg.style.opacity = "1";
          msg.style.transform = "translateY(0)";
        }, 50);

        injectedCount++;
      }
    });

    if (injectedCount > 0) {
      console.log(`📨 [MYM Polling] ${injectedCount} new message(s) injected`);

      // Scroll to bottom
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 350);
    }

    return injectedCount;
  }

  // ========================================
  // POLL ONCE
  // ========================================
  async function pollOnce() {
    const now = Date.now();

    // Prevent too frequent polling
    if (now - lastPollTime < 3000) {
      // // // console.log("⏱️ [MYM Polling] Skipped (too soon)");
      return;
    }

    lastPollTime = now;

    // Only poll if on a chat page
    const isChatPage = window.location.pathname.includes("/app/chat/fan/");
    if (!isChatPage) return;

    const fanId = window.location.pathname.split("/app/chat/fan/")[1];
    if (!fanId) return;

    try {
      // // // console.log("🔄 [MYM Polling] Fetching new messages...");

      const response = await fetch(
        `https://creators.mym.fans/app/chat/fan/${fanId}`,
        {
          headers: {
            Accept: "text/html",
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        console.warn(`⚠️ [MYM Polling] HTTP ${response.status}`);
        return;
      }

      const html = await response.text();

      // Extract chat content
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const chatContent = doc.querySelector(".chat__content");

      if (chatContent) {
        const injectedCount = injectNewMessages(chatContent.innerHTML);

        // Update conversation list if new messages
        if (injectedCount > 0 && contentAPI.conversations) {
          setTimeout(() => {
            contentAPI.conversations.updateConversationsList();
          }, 500);
        }
      }
    } catch (error) {
      console.error("❌ [MYM Polling] Error:", error);
    }
  }

  // ========================================
  // START/STOP POLLING
  // ========================================
  function startPolling() {
    if (pollingInterval) {
      // // // console.log("⚠️ [MYM Polling] Already running");
      return;
    }

    const interval = isTabVisible
      ? POLL_INTERVAL_MS
      : POLL_INTERVAL_BACKGROUND_MS;

    console.log(`🔔 [MYM Polling] Started (interval: ${interval}ms)`);

    pollingInterval = setInterval(pollOnce, interval);

    // Initial poll after 3 seconds
    setTimeout(pollOnce, 3000);
  }

  function stopPolling() {
    if (!pollingInterval) return;

    clearInterval(pollingInterval);
    pollingInterval = null;
    // // // console.log("⏸️ [MYM Polling] Stopped");
  }

  function restartPolling() {
    stopPolling();
    startPolling();
  }

  // ========================================
  // TAB VISIBILITY HANDLING
  // ========================================
  function handleVisibilityChange() {
    if (document.hidden) {
      isTabVisible = false;
      // // // console.log("👁️ [MYM Polling] Tab hidden, switching to slow polling");
      restartPolling();
    } else {
      isTabVisible = true;
      // // // console.log("👁️ [MYM Polling] Tab visible, switching to fast polling");
      restartPolling();
      // Poll immediately when tab becomes visible
      setTimeout(pollOnce, 500);
    }
  }

  // ========================================
  // NAVIGATION OBSERVER
  // ========================================
  let lastUrl = location.href;

  function observeNavigation() {
    const observer = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;

        const isChatPage = currentUrl.includes("/app/chat/fan/");

        if (isChatPage) {
          // // // console.log("🔄 [MYM Polling] Chat page detected, restarting polling");
          restartPolling();
        } else {
          // // // console.log("⏸️ [MYM Polling] Left chat page, stopping polling");
          stopPolling();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  function init() {
    // // // console.log("🚀 [MYM Polling] Module initializing...");

    // Start polling if on chat page
    const isChatPage = window.location.pathname.includes("/app/chat/fan/");
    if (isChatPage) {
      startPolling();
    }

    // Listen to visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Observe navigation
    observeNavigation();

    // Cleanup on page unload
    window.addEventListener("beforeunload", stopPolling);
  }

  // Exposer dans l'API
  contentAPI.polling = {
    startPolling,
    stopPolling,
    pollOnce,
    init,
  };

  // // // console.log("✅ [MYM Polling] Module loaded");
})(window.MYM_CONTENT_API);
