// content.js - Refactored to use modular architecture
// Main orchestrator that delegates to specialized modules
(function () {
  "use strict";

  // Prevent multiple injections
  if (window.__MYM_EXTENSION_LOADED__) {
    return;
  }
  window.__MYM_EXTENSION_LOADED__ = true;

  // ========================================
  // INJECT GLOBAL STYLES
  // ========================================
  (function injectGlobalStyles() {
    if (document.getElementById("mym-live-style")) return;

    const style = document.createElement("style");
    style.id = "mym-live-style";
    style.textContent = `
      .mym-live-anim{animation: mym-appear 700ms ease both}
      @keyframes mym-appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      
      /* Fix scroll comportment pour discussions */
      html, body {
        overflow: hidden !important;
        height: 100%;
        margin: 0;
        padding: 0;
      }
      
      .main.main-discussions {
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
        height: calc(100vh - 100px);
      }
      
      .content-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }
      
      .discussions {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        max-height: calc(100vh - 173px);
        overflow: hidden;
        height: calc(100vh - 173px) !important;
      }
      
      .discussions__chats {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        min-height: 0;
      }
      
      aside.sidebar {
        justify-content: flex-start !important;
      }
      
      /* Fix margin for navigation links in list rows */
      .link.link--default.link--icon-after {
        margin-top: 0 !important;
      }
      
      /* Make /app/myms page list scrollable with max height */
      .page.my-myms {
        height: 80vh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      
      /* Désactivation du hover sur list__row UNIQUEMENT dans le main (pas dans la sidebar) */
      .main .list__row {
        cursor: default !important;
      }
      
      /* Les lignes dans la sidebar restent cliquables */
      aside.sidebar .list__row {
        cursor: pointer !important;
      }
      
      /* Effet hover sur les lignes de conversation - page /app/myms */
      .page.my-myms .list__row {
        transition: all 0.2s ease;
      }
      
      .page.my-myms .list__row:hover {
        background: rgba(102, 126, 234, 0.08) !important;
        transform: translateX(4px);
      }
      
      /* Effet hover sur les lignes de conversation - liste injectée (sidebar) */
      aside.sidebar .list__row {
        transition: all 0.2s ease;
      }
      
      aside.sidebar .list__row:hover {
        background: rgba(102, 126, 234, 0.08) !important;
        transform: translateX(4px);
      }
      
      .list__row .link--icon-after svg {
        display: none !important;
      }
      
      /* Remove horizontal scroll from conversations list */
      .mym-conversations-list {
        overflow-x: hidden !important;
      }
      
      .mym-conversations-list .list__row {
        max-width: 100% !important;
        overflow: hidden !important;
      }
      
      /* Make followers details scrollable with 50vh height */
      .followers__details {
        height: 50vh !important;
        overflow-y: auto !important;
        width: 100% !important;
        padding: 0 !important;
      }
      
      /* Mobile responsive - reduce padding bottom on discussions */
      @media (max-width: 768px) {
        .discussions__chats.discussions__chats--creators {
          padding-bottom: 100px !important;
        }
      }
    `;
    document.head.appendChild(style);
    // // // // console.log("🎨 [MYM] Global styles injected");
  })();

  // Verify modules are loaded
  const contentAPI = window.MYM_CONTENT_API;
  if (!contentAPI) {
    console.error(
      "❌ [MYM] Modules not loaded! Make sure modules load before content.js"
    );
    return;
  }

  // // // // console.log("🚀 [MYM Content] Starting main orchestrator...");

  // ========================================
  // CONFIGURATION & CONSTANTS
  // ========================================
  const MESSAGE_SELECTOR = ".chat-message[data-chat-message-id]";
  const LIST_ROW_SELECTOR =
    ".list__row, .sidebar__footer__list > div, .discussions__chat";
  const CONTAINER_SELECTOR = ".discussions__chats, .sidebar__footer__list";
  const DISCUSSIONS_SELECTOR =
    ".discussions, .page.my-myms, .sidebar__footer__list";
  const NAV_SELECTOR = ".aside.sidebar, aside.sidebar";

  const POLL_INTERVAL_MS =
    (window.APP_CONFIG && window.APP_CONFIG.POLL_INTERVAL_MS) || 10000;
  const SUBSCRIPTION_CHECK_INTERVAL =
    (window.APP_CONFIG && window.APP_CONFIG.SUBSCRIPTION_CHECK_INTERVAL) ||
    60 * 60 * 1000;
  const MAX_PAGES_FETCH =
    (window.APP_CONFIG && window.APP_CONFIG.MAX_PAGES_FETCH) || 10;

  // ========================================
  // STATE MANAGEMENT
  // ========================================
  const chatId = contentAPI.getChatId();
  const isMymsPage =
    location.pathname.startsWith("/app/myms") ||
    document.querySelector(".page.my-myms") !== null;
  const isFollowersPage = location.pathname.startsWith(
    "/app/account/my-followers"
  );
  const isChatPage = !!chatId;

  if (!chatId && !isMymsPage && !isFollowersPage) {
    // // // // console.log("🔍 [MYM] Not a handled page, exiting");
    return;
  }

  let knownChatIds = new Set();
  let knownListIds = new Set();
  let pollHandle = null;
  let observer = null;
  let pollingInProgress = false;
  let discussionsInjected = false;

  // References for cleanup
  let footerObserver = null;
  let inputObserver = null;
  let notesButtonObserver = null;
  let urlObserver = null;
  let globalClickHandler = null;
  let popstateHandler = null;
  let messageListener = null;
  let subscriptionMonitoringInterval = null;

  // Feature flags (initialized from storage)
  let badgesEnabled = true;
  let statsEnabled = true;
  let emojiEnabled = true;
  let notesEnabled = true;

  // ========================================
  // DETECTOR INJECTION (Page Context)
  // ========================================
  (function injectDetector() {
    try {
      const runtimeAPI =
        typeof browser !== "undefined" && browser.runtime
          ? browser.runtime
          : window.chrome && chrome.runtime
          ? chrome.runtime
          : null;

      if (runtimeAPI && runtimeAPI.getURL) {
        const url = runtimeAPI.getURL("detector.js");
        const s = document.createElement("script");
        s.src = url;
        s.onload = function () {
          try {
            this.remove();
          } catch (e) {}
        };
        (
          document.documentElement ||
          document.head ||
          document.body
        ).appendChild(s);
      }
    } catch (e) {
      console.error("❌ [MYM] Failed to inject detector:", e);
    }
  })();

  // ========================================
  // SUBSCRIPTION MONITORING
  // ========================================
  function startSubscriptionMonitoring() {
    if (subscriptionMonitoringInterval) return;

    subscriptionMonitoringInterval = setInterval(async () => {
      if (!chrome.runtime || !chrome.runtime.id) {
        console.warn(
          "[MYM] Extension context invalidated, stopping subscription monitoring"
        );
        stopSubscriptionMonitoring();
        return;
      }

      try {
        const token = await contentAPI.safeStorageGet("local", ["access_token"]);
        if (!token.access_token) return;

        const isActive = await contentAPI.api.checkSubscription(
          token.access_token
        );
        if (!isActive) {
          showSubscriptionExpiredBanner();
          stopSubscriptionMonitoring();
        }
      } catch (err) {
        // Don't log error if extension context is invalidated
        if (err.message !== "Extension context invalidated") {
          console.error("❌ [MYM] Subscription check error:", err);
        }
      }
    }, SUBSCRIPTION_CHECK_INTERVAL);
  }

  function stopSubscriptionMonitoring() {
    if (subscriptionMonitoringInterval) {
      clearInterval(subscriptionMonitoringInterval);
      subscriptionMonitoringInterval = null;
    }
  }

  function showSubscriptionExpiredBanner() {
    if (document.getElementById("mym-subscription-expired-banner")) return;

    const banner = document.createElement("div");
    banner.id = "mym-subscription-expired-banner";
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      color: white;
      padding: 12px 20px;
      text-align: center;
      font-size: 14px;
      font-weight: 600;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    banner.innerHTML = `
      ⚠️ Votre abonnement MYM Chat Live Injector a expiré. 
      <a href="https://mymchat.fr/pricing" target="_blank" style="color: white; text-decoration: underline; margin-left: 10px;">
        Renouveler maintenant
      </a>
    `;
    document.body.appendChild(banner);
  }

  // ========================================
  // FEATURE FLAGS MANAGEMENT
  // ========================================
  async function readFeatureFlags() {
    const items = await contentAPI.safeStorageGet("local", [
      "badgesEnabled",
      "statsEnabled",
      "emojiEnabled",
      "notesEnabled",
    ]);

    return {
      badges: items.badgesEnabled !== false,
      stats: items.statsEnabled !== false,
      emoji: items.emojiEnabled !== false,
      notes: items.notesEnabled !== false,
    };
  }

  async function readEnabledFlag(defaultValue = true) {
    const items = await contentAPI.safeStorageGet("local", ["enabled"]);
    return items.enabled !== false ? defaultValue : false;
  }

  async function initializeFeatureFlags() {
    const flags = await readFeatureFlags();
    badgesEnabled = flags.badges;
    statsEnabled = flags.stats;
    emojiEnabled = flags.emoji;
    notesEnabled = flags.notes;

    // Share flags with modules
    contentAPI.badgesEnabled = badgesEnabled;
    contentAPI.statsEnabled = statsEnabled;
    contentAPI.emojiEnabled = emojiEnabled;
    contentAPI.notesEnabled = notesEnabled;

    // // // // console.log("🔧 [MYM] Feature flags:", flags);
  }

  // ========================================
  // MESSAGE POLLING
  // ========================================
  async function pollForNewMessages() {
    if (pollingInProgress) return;
    pollingInProgress = true;

    try {
      const token = await contentAPI.safeStorageGet("local", ["access_token"]);
      if (!token.access_token) {
        pollingInProgress = false;
        return;
      }

      const url = `https://mym.fans/api/conversations/${chatId}/messages?page=1`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      });

      if (!response.ok) {
        pollingInProgress = false;
        return;
      }

      const data = await response.json();
      if (data && data.data && Array.isArray(data.data)) {
        injectNewMessages(data.data);
      }
    } catch (err) {
      console.error("❌ [MYM] Polling error:", err);
    } finally {
      pollingInProgress = false;
    }
  }

  function injectNewMessages(messages) {
    const container = document.querySelector(".chat-messages");
    if (!container) return;

    const existingIds = new Set();
    container.querySelectorAll(MESSAGE_SELECTOR).forEach((msg) => {
      const id = msg.getAttribute("data-chat-message-id");
      if (id) existingIds.add(id);
    });

    messages.forEach((msg) => {
      if (!existingIds.has(msg.id.toString())) {
        // Message injection logic would go here
        // For now, just log
        // // // // console.log("📨 New message:", msg.id);
      }
    });
  }

  function startPolling() {
    if (pollHandle || !chatId) return;
    // // // // console.log("▶️ [MYM] Starting message polling");
    pollHandle = setInterval(pollForNewMessages, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
      // // // // console.log("⏸️ [MYM] Stopped message polling");
    }
  }

  // ========================================
  // MAKE LIST ROWS CLICKABLE
  // ========================================
  function makeRowClickable(row) {
    // Désactivé : la ligne entière (content-search-bar et list__row) ne doit plus être cliquable
    // pour éviter les redirections non désirées vers la même page
    return;
  }

  function makeListRowsClickable() {
    // Désactivé : les lignes ne doivent plus être cliquables
    return;
  }

  // ========================================
  // OBSERVERS & FEATURE INITIALIZATION
  // ========================================
  function initializeObservers() {
    // // // // console.log("🔍 [MYM] Initializing observers...");
    // // // // console.log("🔍 [MYM] Available modules:", Object.keys(contentAPI));

    // Désactivé : les lignes ne doivent plus être cliquables
    // makeListRowsClickable();

    // Observer for new chat cards (for badges only, clickable rows disabled)
    if (badgesEnabled && contentAPI.badges) {
      // // // // console.log("✅ [MYM] Setting up badges observer");
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              const cards = node.querySelectorAll
                ? node.querySelectorAll(LIST_ROW_SELECTOR)
                : [];
              if (node.matches && node.matches(LIST_ROW_SELECTOR)) {
                contentAPI.badges.scanSingleCard(node);
                // Désactivé : makeRowClickable(node);
              }
              cards.forEach((card) => {
                contentAPI.badges.scanSingleCard(card);
                // Désactivé : makeRowClickable(card);
              });
            }
          });
        });
      });

      const discussionsContainer = document.querySelector(DISCUSSIONS_SELECTOR);
      if (discussionsContainer) {
        observer.observe(discussionsContainer, {
          childList: true,
          subtree: true,
        });
        // // // // console.log("✅ [MYM] Badges observer attached");
      } else {
        console.warn("⚠️ [MYM] Discussions container not found");
      }
    } else {
      // // // // console.log("⏸️ [MYM] Badges disabled or module not loaded");
    }

    // Initial scan for badges
    if (badgesEnabled && contentAPI.badges) {
      // // // // console.log("🔍 [MYM] Scanning existing lists for badges...");
      setTimeout(() => {
        contentAPI.badges.scanExistingListsForBadges();
      }, 1000);
    }

    // Initialize emoji picker
    if (emojiEnabled && contentAPI.emoji) {
      // // // // console.log("😊 [MYM] Initializing emoji picker");
      contentAPI.emoji.initEmojiPicker();

      // Ajouter les boutons emoji aux inputs existants
      setTimeout(() => {
        const inputFields = document.querySelectorAll(".input__field");
        inputFields.forEach((field) => {
          contentAPI.emoji.addEmojiButtonToInput(field);
        });
      }, 1000);

      // Observer pour les nouveaux inputs
      const emojiObserver = new MutationObserver(() => {
        const inputFields = document.querySelectorAll(".input__field");
        inputFields.forEach((field) => {
          if (!field.querySelector(".mym-emoji-trigger")) {
            contentAPI.emoji.addEmojiButtonToInput(field);
          }
        });
      });

      emojiObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // // // // console.log("⏸️ [MYM] Emoji disabled or module not loaded");
    }

    // Initialize notes system
    if (notesEnabled && contentAPI.notes) {
      // // // // console.log("📝 [MYM] Initializing notes system");
      contentAPI.notes.initNotesSystem();

      // Ajouter le bouton notes immédiatement
      setTimeout(() => {
        contentAPI.notes.createNotesButton();
      }, 1000);

      // Observer pour réinjecter le bouton si nécessaire
      const notesObserver = new MutationObserver(() => {
        if (isChatPage && !document.getElementById("mym-notes-button")) {
          contentAPI.notes.createNotesButton();
        }
      });

      notesObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // // // // console.log("⏸️ [MYM] Notes disabled or module not loaded");
    }

    // Initialize conversations list
    if (contentAPI.conversations) {
      // // // // console.log("💬 [MYM] Initializing conversations list");
      contentAPI.conversations.init();
    }

    // Initialize keyboard shortcuts (Ctrl+Enter)
    if (contentAPI.keyboard) {
      // // // // console.log("⌨️ [MYM] Initializing keyboard shortcuts");
      contentAPI.keyboard.init();
    }

    // Initialize auto-polling
    if (contentAPI.polling) {
      // // // // console.log("🔔 [MYM] Initializing auto-polling");
      contentAPI.polling.init();
    }

    // Initialize sidebar toggle (mobile)
    if (contentAPI.sidebarToggle) {
      // // // // console.log("📱 [MYM] Initializing sidebar toggle");
      contentAPI.sidebarToggle.init();
    }

    // Initialize stats box
    if (statsEnabled && contentAPI.stats && isChatPage) {
      const username = contentAPI.getCurrentConversationUsername();
      if (username) {
        // // // // console.log("📊 [MYM] Injecting stats box for:", username);
        contentAPI.stats.injectUserInfoBox(username);
      } else {
        console.warn("⚠️ [MYM] No username found for stats box");
      }
    } else {
      // // // // console.log("⏸️ [MYM] Stats disabled, module not loaded, or not on chat page");
    }
  }

  // ========================================
  // MESSAGE LISTENER (Background Communication)
  // ========================================
  function setupMessageListener() {
    if (messageListener) return;

    messageListener = (message, sender, sendResponse) => {
      if (message.action === "featuresEnabled") {
        // // // // console.log("🔓 [MYM] Features enabled by background");
        readFeatureFlags().then((flags) => {
          badgesEnabled = flags.badges;
          statsEnabled = flags.stats;
          emojiEnabled = flags.emoji;
          notesEnabled = flags.notes;

          // Update module flags
          contentAPI.badgesEnabled = badgesEnabled;
          contentAPI.statsEnabled = statsEnabled;
          contentAPI.emojiEnabled = emojiEnabled;
          contentAPI.notesEnabled = notesEnabled;

          readEnabledFlag(false).then((enabled) => {
            if (enabled) {
              startPolling();
            }
          });
        });
      }

      if (message.action === "featuresDisabled") {
        badgesEnabled = false;
        statsEnabled = false;
        emojiEnabled = false;
        notesEnabled = false;
        stopPolling();

        setTimeout(() => {
          window.location.reload();
        }, 500);
      }

      if (message.type === "REFRESH_FIREBASE_TOKEN") {
        (async () => {
          const token = await contentAPI.safeStorageGet("local", [
            "access_token",
          ]);
          if (token.access_token) {
            // // // // console.log("🔄 [MYM] Proactive Firebase token refresh");
            // Token refresh logic would go here
          }
        })();
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
  }

  // ========================================
  // CLEANUP
  // ========================================
  function cleanupAll() {
    stopPolling();
    stopSubscriptionMonitoring();

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (footerObserver) {
      footerObserver.disconnect();
      footerObserver = null;
    }

    if (inputObserver) {
      inputObserver.disconnect();
      inputObserver = null;
    }

    if (notesButtonObserver) {
      notesButtonObserver.disconnect();
      notesButtonObserver = null;
    }

    if (urlObserver) {
      urlObserver.disconnect();
      urlObserver = null;
    }

    if (globalClickHandler) {
      document.removeEventListener("click", globalClickHandler);
      globalClickHandler = null;
    }

    if (popstateHandler) {
      window.removeEventListener("popstate", popstateHandler);
      popstateHandler = null;
    }

    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
      messageListener = null;
    }

    // // // // console.log("🧹 [MYM] Cleanup completed");
  }

  window.addEventListener("beforeunload", cleanupAll);

  // ========================================
  // INITIALIZATION
  // ========================================
  (async function init() {
    // // // // console.log("🎬 [MYM] Initializing extension...");

    // 1. Vérifier d'abord si les fonctionnalités sont activées (check background.js flags)
    const mainFlags = await contentAPI.safeStorageGet("local", [
      "mym_live_enabled",
      "mym_badges_enabled",
      "mym_stats_enabled",
      "mym_emoji_enabled",
      "mym_notes_enabled",
    ]);

    // Si TOUTES les fonctionnalités sont désactivées, ne rien charger
    const anyEnabled = Object.values(mainFlags).some((val) => val === true);
    if (!anyEnabled) {
      console.log(
        "⏸️ [MYM] Toutes les fonctionnalités sont désactivées - extension non chargée"
      );
      return;
    }

    // 2. Initialize feature flags
    await initializeFeatureFlags();

    // 3. Check if extension is enabled
    const isEnabled = await readEnabledFlag(true);
    if (!isEnabled) {
      // // // // console.log("⏸️ [MYM] Extension disabled by user");
      return;
    }

    // 4. Verify subscription
    const token = await contentAPI.safeStorageGet("local", ["access_token"]);
    if (token.access_token && contentAPI.api) {
      try {
        const isActive = await contentAPI.api.checkSubscription(
          token.access_token
        );
        if (!isActive) {
          showSubscriptionExpiredBanner();
          return;
        }
        startSubscriptionMonitoring();
      } catch (err) {
        console.warn(
          "⚠️ [MYM] Subscription check failed (continuing anyway):",
          err
        );
        // Continue even if API is down
      }
    } else if (!contentAPI.api) {
      console.warn(
        "⚠️ [MYM] API module not loaded, skipping subscription check"
      );
    }

    // 4. Initialize features
    initializeObservers();

    // 5. Start message polling if on chat page
    if (isChatPage) {
      startPolling();
    }

    // 6. Setup background communication
    setupMessageListener();

    // // // // console.log("✅ [MYM] Extension initialized successfully");
  })();
})();

// ========================================
// GLOBAL ERROR HANDLER
// ========================================
window.addEventListener(
  "error",
  function (e) {
    if (e.filename && e.filename.includes("chrome-extension://")) {
      console.error("⚠️ [MYM] Extension error (non-fatal):", e.message);
      e.stopPropagation();
      return true;
    }
  },
  true
);

// // // // console.log("✅ [MYM Content] Main orchestrator loaded");
