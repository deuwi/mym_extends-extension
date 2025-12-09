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

  const POLL_INTERVAL_MS = 15000; // 15 seconds
  const POLL_INTERVAL_BACKGROUND_MS = 30000; // 30 seconds when tab is hidden
  const CONVERSATIONS_POLL_INTERVAL_MS = 30000; // 30 seconds for conversations list

  let pollingInterval = null;
  let conversationsPollingInterval = null;
  let lastPollTime = 0;
  let lastConversationsPollTime = 0;
  let isTabVisible = true;

  // ========================================
  // MESSAGE INJECTION FROM HTML PARSING
  // ========================================
  function injectNewMessagesFromHTML(html) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Trouver tous les messages dans le HTML récupéré
      const fetchedMessages = doc.querySelectorAll(".chat-message[data-chat-message-id]");

      // Trouver le conteneur de messages sur la page actuelle
      const chatContainer = document.querySelector(".discussions__chats");
      if (!chatContainer) {
        console.error("❌ [MYM Polling] Chat container not found");
        return 0;
      }

      // Obtenir les IDs des messages existants
      const existingMessages = document.querySelectorAll(".chat-message[data-chat-message-id]");
      const existingIds = new Set(
        Array.from(existingMessages).map((msg) =>
          msg.getAttribute("data-chat-message-id")
        )
      );

      let newMessagesCount = 0;

      // Injecter les nouveaux messages
      fetchedMessages.forEach((fetchedMsg) => {
        const messageId = fetchedMsg.getAttribute("data-chat-message-id");

        if (!existingIds.has(messageId)) {
          // Cloner le message complet (y compris le HTML et les classes)
          const newMessage = fetchedMsg.cloneNode(true);

          // Ajouter une animation de fade-in
          newMessage.style.opacity = "0";
          newMessage.style.transition = "opacity 0.3s ease-in";

          // Ajouter le message au conteneur
          chatContainer.appendChild(newMessage);

          // Trigger l'animation
          setTimeout(() => {
            newMessage.style.opacity = "1";
          }, 10);

          newMessagesCount++;
        }
      });

      if (newMessagesCount > 0) {
        // Scroller vers le bas
        const chatBody = document.querySelector(".content-body");
        if (chatBody) {
          chatBody.scrollTop = chatBody.scrollHeight;
        }
      }

      return newMessagesCount;
    } catch (error) {
      console.error("❌ [MYM Polling] Error:", error);
      return 0;
    }
  }

  // ========================================
  // POLL ONCE
  // ========================================
  async function pollOnce() {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      stopPolling();
      return;
    }

    const now = Date.now();

    // Prevent too frequent polling
    if (now - lastPollTime < 3000) {
      // // // console.log("⏱️ [MYM Polling] Skipped (too soon)");
      return;
    }

    lastPollTime = now;

    // Only poll if on a chat page (support both /app/chat/ID and /app/chat/fan/ID)
    const isChatPage = window.location.pathname.startsWith("/app/chat/");
    if (!isChatPage) {
      return;
    }

    // Extract fanId from URL (support both formats)
    let fanId = window.location.pathname.split("/app/chat/fan/")[1];
    if (!fanId) {
      fanId = window.location.pathname.split("/app/chat/")[1];
    }
    if (!fanId) {
      return;
    }

    try {
      // Fetch the chat page HTML directly
      const pageUrl = `https://creators.mym.fans/app/chat/${fanId}`;

      const response = await fetch(pageUrl, {
        credentials: "include", // Send cookies automatically
      });

      if (!response.ok) {
        return;
      }

      const html = await response.text();
      const injectedCount = injectNewMessagesFromHTML(html);

      // Update conversation list if new messages
      if (injectedCount > 0 && contentAPI.conversations) {
        setTimeout(() => {
          contentAPI.conversations.updateConversationsList();
        }, 500);
      }
    } catch (error) {
      // Don't log error if extension context is invalidated
      if (error.message === "Extension context invalidated") {
        stopPolling();
        return;
      }
      console.error("❌ [MYM Polling] Error:", error);
    }
  }

  // ========================================
  // POLL CONVERSATIONS LIST
  // ========================================
  async function pollConversationsList() {
    const now = Date.now();

    // Prevent too frequent polling
    if (now - lastConversationsPollTime < 10000) {
      return;
    }

    lastConversationsPollTime = now;

    // Only update if on a chat page and conversations API is available
    const isChatPage = window.location.pathname.startsWith("/app/chat/");
    if (!isChatPage || !contentAPI.conversations) {
      return;
    }

    try {
      await contentAPI.conversations.updateConversationsList();
    } catch (error) {
      // Silently ignore errors for conversations list
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

    pollingInterval = setInterval(pollOnce, interval);

    // Start conversations list polling
    if (!conversationsPollingInterval) {
      conversationsPollingInterval = setInterval(pollConversationsList, CONVERSATIONS_POLL_INTERVAL_MS);
      // Initial poll after 5 seconds
      setTimeout(pollConversationsList, 5000);
    }

    // Initial poll after 3 seconds
    setTimeout(pollOnce, 3000);
  }

  function stopPolling() {
    if (!pollingInterval) return;

    clearInterval(pollingInterval);
    pollingInterval = null;

    // Also stop conversations polling when leaving chat pages
    if (conversationsPollingInterval) {
      clearInterval(conversationsPollingInterval);
      conversationsPollingInterval = null;
    }
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

        const isChatPage = currentUrl.includes("/app/chat/");

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
    // Start polling if on chat page (support both /app/chat/ID and /app/chat/fan/ID)
    const isChatPage = window.location.pathname.startsWith("/app/chat/");
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
