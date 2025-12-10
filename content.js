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

  // Access shared utilities
  const debounce = contentAPI.debounce;
  const SELECTORS = contentAPI.SELECTORS;

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
  // REMOVE DETAILS TAGS
  // ========================================
  (function removeDetailsTags() {
    function removeAllDetails() {
      const details = document.querySelectorAll('details');
      if (details.length > 0) {
        details.forEach(el => {
          // Remove <details> and all its children
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
        // // console.log(`🚫 [MYM] Removed ${details.length} <details> tag(s)`);
      }
    }

    // Remove on page load
    removeAllDetails();

    // Watch for new details tags
    const observer = new MutationObserver(() => {
      removeAllDetails();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
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

        // NOTE: La vérification de l'abonnement est gérée par background.js
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
    
    // Créer le message de manière sécurisée
    const message = document.createTextNode("⚠️ Votre abonnement MYM Chat Live Injector a expiré. ");
    const link = document.createElement("a");
    link.href = "https://mymchat.fr/pricing";
    link.target = "_blank";
    link.style.cssText = "color: white; text-decoration: underline; margin-left: 10px;";
    link.textContent = "Renouveler maintenant";
    
    banner.appendChild(message);
    banner.appendChild(link);
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
  // NOTE: Le polling des messages est maintenant géré par modules/auto-polling.js
  // qui parse le HTML au lieu d'utiliser l'API JSON (qui n'existe pas)

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
      
      // Debounced callback to reduce excessive mutations processing
      const processBadgeMutations = debounce((mutations) => {
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
      }, 200); // Debounce 200ms to batch rapid DOM changes

      observer = new MutationObserver(processBadgeMutations);

      const discussionsContainer = document.querySelector(DISCUSSIONS_SELECTOR);
      if (discussionsContainer) {
        observer.observe(discussionsContainer, {
          childList: true,
          subtree: false, // Limited to direct children for better performance
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

      // Observer pour les nouveaux inputs avec debounce
      const processEmojiMutations = debounce(() => {
        const inputFields = document.querySelectorAll(".input__field");
        inputFields.forEach((field) => {
          if (!field.querySelector(".mym-emoji-trigger")) {
            contentAPI.emoji.addEmojiButtonToInput(field);
          }
        });
      }, 300); // Debounce 300ms pour éviter scan excessif

      const emojiObserver = new MutationObserver(processEmojiMutations);

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

      // Observer pour réinjecter le bouton si nécessaire avec debounce
      const processNotesMutations = debounce(() => {
        if (isChatPage && !document.getElementById("mym-notes-button")) {
          contentAPI.notes.createNotesButton();
        }
      }, 300); // Debounce 300ms pour éviter checks répétés

      const notesObserver = new MutationObserver(processNotesMutations);

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

          // Re-initialize enabled features
          if (badgesEnabled && contentAPI.badges && contentAPI.badges.scanExistingListsForBadges) {
            setTimeout(() => contentAPI.badges.scanExistingListsForBadges(), 500);
          }
          
          if (statsEnabled && contentAPI.stats && contentAPI.stats.injectUserInfoBox) {
            const username = contentAPI.getCurrentConversationUsername();
            if (username) {
              setTimeout(() => contentAPI.stats.injectUserInfoBox(username), 500);
            }
          }
          
          if (emojiEnabled && contentAPI.emoji && contentAPI.emoji.addEmojiButtonToInput) {
            const inputs = document.querySelectorAll('textarea[placeholder*="message"], textarea[name="message"]');
            inputs.forEach(input => {
              const container = input.closest('.form-message, .message-input-container, .chat-input');
              if (container && !container.querySelector('.mym-emoji-trigger')) {
                contentAPI.emoji.addEmojiButtonToInput(container);
              }
            });
          }
          
          if (notesEnabled && contentAPI.notes && contentAPI.notes.createNotesButton) {
            const chatHeader = document.querySelector(SELECTORS.CHAT_HEADER);
            if (chatHeader && !chatHeader.querySelector('#mym-notes-button')) {
              setTimeout(() => contentAPI.notes.createNotesButton(), 500);
            }
          }

          console.log("✅ [MYM] Features re-enabled and UI re-injected");
        });
      }

      if (message.action === "featuresDisabled") {
        // Disable features flags
        badgesEnabled = false;
        statsEnabled = false;
        emojiEnabled = false;
        notesEnabled = false;

        // Update module flags
        contentAPI.badgesEnabled = false;
        contentAPI.statsEnabled = false;
        contentAPI.emojiEnabled = false;
        contentAPI.notesEnabled = false;

        // Remove UI elements from DOM instead of reloading
        if (contentAPI.badges && contentAPI.badges.removeBadgesUI) {
          contentAPI.badges.removeBadgesUI();
        }
        if (contentAPI.stats && contentAPI.stats.removeStatsBox) {
          contentAPI.stats.removeStatsBox();
        }
        if (contentAPI.emoji && contentAPI.emoji.removeEmojiUI) {
          contentAPI.emoji.removeEmojiUI();
        }
        if (contentAPI.notes && contentAPI.notes.removeNotesUI) {
          contentAPI.notes.removeNotesUI();
        }

        // Stop polling (handled by auto-polling.js)
        console.log("🛑 [MYM] All features disabled and UI elements removed");
      }

      if (message.type === "REFRESH_FIREBASE_TOKEN") {
        (async () => {
          try {
            console.log("🔄 [MYM] Proactive Firebase token refresh requested");
            
            // Déclencher le refresh via le site web si on est sur creators.mym.fans
            if (window.location.hostname === 'creators.mym.fans') {
              // Demander au site web de rafraîchir le token
              window.dispatchEvent(new CustomEvent('extension-request-fresh-token'));
              
              // Attendre un peu pour que le site web rafraîchisse le token
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              console.log("✅ [MYM] Token refresh triggered via website");
            } else {
              // Si on n'est pas sur le site, on ne peut pas rafraîchir
              console.log("ℹ️ [MYM] Not on creators.mym.fans, skipping token refresh");
            }
          } catch (error) {
            console.error("❌ [MYM] Error refreshing token:", error);
          }
        })();
      }

      if (message.action === "applyTheme" && message.theme) {
        // Appliquer le thème sur la page
        applyThemeToPage(message.theme);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
  }

  // ========================================
  // THEME APPLICATION
  // ========================================
  function applyThemeToPage(theme) {
    // Créer ou mettre à jour la balise <style> pour le thème
    let themeStyle = document.getElementById("mym-theme-style");
    if (!themeStyle) {
      themeStyle = document.createElement("style");
      themeStyle.id = "mym-theme-style";
      document.head.appendChild(themeStyle);
    }

    // CSS pour appliquer le thème sur les éléments de la page
    themeStyle.textContent = `
      /* Theme override for MYM pages */
      :root {
        --mym-theme-primary: ${theme.primary} !important;
        --mym-theme-secondary: ${theme.secondary} !important;
        --mym-theme-gradient: ${theme.gradient} !important;
      }

      /* Appliquer aux boutons principaux */
      button[class*="primary"],
      .btn-primary,
      [class*="PrimaryButton"] {
        background: ${theme.gradient} !important;
      }

      /* Appliquer aux liens actifs */
      a.active,
      [class*="active"] a {
        color: ${theme.primary} !important;
      }

      /* Appliquer aux badges de revenus */
      .revenue-badge,
      [class*="RevenueBadge"] {
        background: ${theme.gradient} !important;
      }

      /* Appliquer aux éléments de stats */
      .stats-box,
      [class*="StatsBox"] {
        border-color: ${theme.primary} !important;
      }

      /* Appliquer aux highlights */
      ::selection {
        background: ${theme.primary} !important;
        color: white !important;
      }
    `;

    console.log(`🎨 [MYM] Thème "${theme.name}" appliqué`);
    
    // Synchroniser avec le localStorage de la page pour le frontend React
    if (window.location.hostname === 'mymchat.fr' || window.location.hostname === 'localhost') {
      // Obtenir le nom du thème depuis chrome.storage
      chrome.storage.local.get(["user_theme"], (data) => {
        const themeName = data.user_theme || "default";
        // Injecter dans le localStorage de la page
        try {
          window.localStorage.setItem("user_theme", themeName);
          // Déclencher un événement storage pour que React détecte le changement
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'user_theme',
            newValue: themeName,
            url: window.location.href
          }));
        } catch (e) {
          console.error("Erreur lors de la synchronisation du thème:", e);
        }
      });
    }
    
    // Mettre à jour les éléments existants avec styles inline
    updateExistingElementsWithTheme(theme);
  }

  // Mettre à jour les éléments déjà créés avec le nouveau thème
  function updateExistingElementsWithTheme(theme) {
    const gradient = theme.gradient;
    
    // Mettre à jour la box de stats
    const userInfoBox = document.getElementById("mym-user-info-box");
    if (userInfoBox) {
      userInfoBox.style.background = gradient;
    }
    
    // Mettre à jour tous les boutons emoji
    const emojiButtons = document.querySelectorAll(".mym-emoji-trigger, .mym-emoji-btn");
    emojiButtons.forEach(button => {
      button.style.background = gradient;
    });
    
    // Mettre à jour le picker emoji
    const emojiPicker = document.getElementById("mym-emoji-picker");
    if (emojiPicker) {
      emojiPicker.style.background = gradient;
    }
    
    // Mettre à jour la section fréquents du picker
    const frequentSection = document.getElementById("mym-frequent-emojis");
    if (frequentSection) {
      frequentSection.style.background = gradient;
    }
    
    // Mettre à jour le panneau notes
    const notesPanel = document.getElementById("mym-notes-panel");
    if (notesPanel) {
      notesPanel.style.background = gradient;
    }
    
    // Mettre à jour tous les boutons notes
    const noteButtons = document.querySelectorAll("#mym-notes-button");
    noteButtons.forEach(button => {
      button.style.background = gradient;
    });
    
    // Mettre à jour l'éditeur de notes (modal)
    const notesEditor = document.querySelector(".mym-notes-editor");
    if (notesEditor) {
      notesEditor.style.background = gradient;
    }
    
    // Mettre à jour le badge de revenu total
    const totalSpentBadge = document.querySelector(".mym-total-spent-badge");
    if (totalSpentBadge) {
      totalSpentBadge.style.background = gradient;
    }
  }

  // Charger et appliquer le thème au chargement
  chrome.storage.local.get(["user_theme"], (data) => {
    const themeName = data.user_theme || "default";
    const THEMES = {
      default: {
        name: "Violet",
        primary: "#667eea",
        secondary: "#764ba2",
        gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      },
      blue: {
        name: "Bleu",
        primary: "#4facfe",
        secondary: "#00f2fe",
        gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
      },
      green: {
        name: "Vert",
        primary: "#43e97b",
        secondary: "#38f9d7",
        gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
      },
      pink: {
        name: "Rose",
        primary: "#f857a6",
        secondary: "#ff5858",
        gradient: "linear-gradient(135deg, #f857a6 0%, #ff5858 100%)",
      },
      orange: {
        name: "Orange",
        primary: "#fa709a",
        secondary: "#fee140",
        gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
      },
      dark: {
        name: "Sombre",
        primary: "#434343",
        secondary: "#000000",
        gradient: "linear-gradient(135deg, #434343 0%, #000000 100%)",
      },
    };

    const theme = THEMES[themeName] || THEMES.default;
    applyThemeToPage(theme);
  });

  // ========================================
  // CLEANUP
  // ========================================
  function cleanupAll() {
    // NOTE: Polling nettoyé par auto-polling.js
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
  // STORAGE CHANGE LISTENER
  // ========================================
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      // Détecter si les features ont été désactivées par le background
      const featureChanges = [
        "mym_live_enabled",
        "mym_badges_enabled", 
        "mym_stats_enabled",
        "mym_emoji_enabled",
        "mym_notes_enabled"
      ];

      const anyFeatureDisabled = featureChanges.some(
        key => {
          const change = changes[key];
          // Vérifier qu'il y a vraiment un changement de true vers false
          return change && 
                 change.oldValue === true && 
                 change.newValue === false;
        }
      );

      if (anyFeatureDisabled) {
        console.log("⚠️ [MYM] Features disabled by background");
        console.log("Changes detected:", changes);
        
        // NE PLUS recharger automatiquement la page
        // Au lieu de cela, laisser les handlers de cleanup faire leur travail
        // L'utilisateur peut recharger manuellement s'il le souhaite
        
        // Note: Le reload automatique causait des problèmes de déconnexion
        // car il se déclenchait pendant la vérification d'abonnement au chargement
      }
    }
  });

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
    // NOTE: La vérification de l'abonnement est gérée par background.js
    const token = await contentAPI.safeStorageGet("local", ["access_token"]);
    if (token.access_token && contentAPI.api) {
      try {
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

    // 5. Message polling is now handled by modules/auto-polling.js

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
