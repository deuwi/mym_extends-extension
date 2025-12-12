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
      
      /* Remove scroll from followers details and add to site-content */
      .followers__details {
        height: auto !important;
        overflow-y: visible !important;
        width: 100% !important;
        padding: 0 !important;
      }
      
      .site-content {
        overflow-y: auto !important;
        max-height: 100vh !important;
      }
      
      /* Mobile responsive - reduce padding bottom on discussions */
      @media (max-width: 768px) {
        .discussions__chats.discussions__chats--creators {
          padding-bottom: 100px !important;
        }
      }
    `;
    document.head.appendChild(style);
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
    5 * 60 * 1000; // 5 minutes
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
      }
    }

    // Remove on page load
    removeAllDetails();

    // Watch for new details tags - observer uniquement le main content
    const mainContent = document.querySelector('.site-content, main, .main');
    if (mainContent) {
      const observer = new MutationObserver(() => {
        removeAllDetails();
      });

      observer.observe(mainContent, {
        childList: true,
        subtree: true
      });
    }
  })();

  // ========================================
  // SUBSCRIPTION MONITORING
  // ========================================
  function startSubscriptionMonitoring() {
    if (subscriptionMonitoringInterval) return;

    // Fonction de vérification
    const checkSubscription = async () => {
      if (!chrome.runtime || !chrome.runtime.id) {
        console.warn(
          "[MYM] Extension context invalidated, stopping subscription monitoring"
        );
        stopSubscriptionMonitoring();
        return;
      }

      try {
        const data = await contentAPI.safeStorageGet("local", ["firebaseToken", "access_token", "user_email"]);
        const token = data.firebaseToken || data.access_token;
        
        if (!token) return;
        
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch(`${contentAPI.API_BASE}/check-subscription`, { headers });
        
        if (!res.ok) {
          if (res.status === 401) {
            // Token expiré - Vérifier l'abonnement par email avant de désactiver
            const userEmail = data.user_email;
            
            if (userEmail) {
              try {
                const emailCheckRes = await fetch(`${contentAPI.API_BASE}/check-subscription`, {
                  headers: { "X-User-Email": userEmail },
                });
                
                if (emailCheckRes.ok) {
                  const emailResult = await emailCheckRes.json();
                  
                  if (emailResult.subscription_active || emailResult.trial_days_remaining > 0 || emailResult.agency_license_active) {
                    console.log("✅ [MYM] Abonnement valide via email - fonctionnalités conservées");
                    return; // Garder les fonctionnalités actives
                  }
                }
              } catch (emailCheckErr) {
                console.warn("⚠️ [MYM] Erreur vérification par email:", emailCheckErr);
              }
            }
            
            // Si impossible de vérifier, désactiver
            console.warn("🔒 [MYM] Token expiré et abonnement non vérifiable - désactivation");
            await chrome.storage.local.set({
              mym_live_enabled: false,
              mym_badges_enabled: false,
              mym_stats_enabled: false,
              mym_emoji_enabled: false,
              mym_notes_enabled: false,
            });
            window.location.reload();
          }
          return;
        }
        
        const result = await res.json();
        
        // Vérifier si l'abonnement est toujours actif
        const hasAccess = result.subscription_active || 
                         result.trial_days_remaining > 0 || 
                         result.agency_license_active;
        
        if (!hasAccess) {
          console.warn("⚠️ [MYM] Abonnement expiré - désactivation de toutes les fonctionnalités");
          // Aucune fonctionnalité disponible en mode gratuit - tout désactiver
          await chrome.storage.local.set({
            mym_live_enabled: false,
            mym_badges_enabled: false,
            mym_stats_enabled: false,
            mym_emoji_enabled: false,
            mym_notes_enabled: false,
            subscription_active: false
          });
          
          // Afficher une bannière d'expiration
          showSubscriptionExpiredBanner();
          
          // Recharger pour appliquer les changements
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (err) {
        // Don't log error if extension context is invalidated
        if (err.message !== "Extension context invalidated") {
          console.error("❌ [MYM] Subscription check error:", err);
        }
      }
    };
    
    // Vérification immédiate au démarrage
    checkSubscription();
    
    // Puis vérification périodique
    subscriptionMonitoringInterval = setInterval(checkSubscription, SUBSCRIPTION_CHECK_INTERVAL);
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

  }

  // ========================================
  // OBSERVERS & FEATURE INITIALIZATION
  // ========================================
  function initializeObservers() {

    // Observer for new chat cards (for badges only, clickable rows disabled)
    if (badgesEnabled && contentAPI.badges) {
      
      // Utiliser le central observer au lieu de créer un nouveau MutationObserver
      if (contentAPI.centralObserver) {
        contentAPI.centralObserver.register("conversationsList", () => {
          if (contentAPI.badges) {
            contentAPI.badges.scanExistingListsForBadges();
          }
        });
      } else {
        console.warn("⚠️ [MYM] Central observer not available for badges, using fallback");
        const processBadgeMutations = debounce((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) {
                const cards = node.querySelectorAll
                  ? node.querySelectorAll(LIST_ROW_SELECTOR)
                  : [];
                if (node.matches && node.matches(LIST_ROW_SELECTOR)) {
                  contentAPI.badges.scanSingleCard(node);
                }
                cards.forEach((card) => {
                  contentAPI.badges.scanSingleCard(card);
                });
              }
            });
          });
        }, 200);

        observer = new MutationObserver(processBadgeMutations);

        const discussionsContainer = document.querySelector(DISCUSSIONS_SELECTOR);
        if (discussionsContainer) {
          observer.observe(discussionsContainer, {
            childList: true,
            subtree: false,
          });
        }
      }
    } else {
    }

    // Initial scan for badges
    if (badgesEnabled && contentAPI.badges) {
      setTimeout(() => {
        contentAPI.badges.scanExistingListsForBadges();
      }, 1000);
    }

    // Initialize emoji picker
    if (emojiEnabled && contentAPI.emoji) {
      contentAPI.emoji.initEmojiPicker();

      // Ajouter les boutons emoji aux inputs existants
      setTimeout(() => {
        const inputFields = document.querySelectorAll(".input__field");
        inputFields.forEach((field) => {
          contentAPI.emoji.addEmojiButtonToInput(field);
        });
      }, 1000);

      // Observer pour les nouveaux inputs - utiliser central observer
      if (contentAPI.centralObserver) {
        contentAPI.centralObserver.register("inputsArea", () => {
          const inputFields = document.querySelectorAll(".input__field");
          inputFields.forEach((field) => {
            if (!field.querySelector(".mym-emoji-trigger")) {
              contentAPI.emoji.addEmojiButtonToInput(field);
            }
          });
        });
      } else {
        console.warn("⚠️ [MYM] Central observer not available for emoji, using fallback");
        const processEmojiMutations = debounce(() => {
          const inputFields = document.querySelectorAll(".input__field");
          inputFields.forEach((field) => {
            if (!field.querySelector(".mym-emoji-trigger")) {
              contentAPI.emoji.addEmojiButtonToInput(field);
            }
          });
        }, 300);

        const emojiObserver = new MutationObserver(processEmojiMutations);

        emojiObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    } else {
    }

    // Initialize notes system
    if (notesEnabled && contentAPI.notes) {
      contentAPI.notes.initNotesSystem();

      // Ajouter le bouton notes immédiatement
      setTimeout(() => {
        contentAPI.notes.createNotesButton();
      }, 1000);

      // Observer pour réinjecter le bouton si nécessaire - utiliser central observer
      if (contentAPI.centralObserver) {
        contentAPI.centralObserver.register("notesArea", () => {
          if (isChatPage && !document.getElementById("mym-notes-button")) {
            contentAPI.notes.createNotesButton();
          }
        });
      } else {
        console.warn("⚠️ [MYM] Central observer not available for notes, using fallback");
        const processNotesMutations = debounce(() => {
          if (isChatPage && !document.getElementById("mym-notes-button")) {
            contentAPI.notes.createNotesButton();
          }
        }, 300);

        const notesObserver = new MutationObserver(processNotesMutations);

        notesObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    } else {
    }

    // Initialize conversations list
    if (contentAPI.conversations) {
      contentAPI.conversations.init();
    }

    // Initialize keyboard shortcuts (Ctrl+Enter)
    if (contentAPI.keyboard) {
      contentAPI.keyboard.init();
    }

    // Initialize auto-polling
    if (contentAPI.polling) {
      contentAPI.polling.init();
    }

    // Initialize sidebar toggle (mobile)
    if (contentAPI.sidebarToggle) {
      contentAPI.sidebarToggle.init();
    }

    // Initialize stats box
    if (statsEnabled && contentAPI.stats && isChatPage) {
      const username = contentAPI.getCurrentConversationUsername();
      if (username) {
        contentAPI.stats.injectUserInfoBox(username);
      } else {
        console.warn("⚠️ [MYM] No username found for stats box");
      }
    } else {
    }
  }

  // ========================================
  // MESSAGE LISTENER (Background Communication)
  // ========================================
  function setupMessageListener() {
    if (messageListener) return;

    messageListener = (message, sender, sendResponse) => {
      if (message.action === "featuresEnabled") {
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
            // Vérifier si on a déjà un refresh en cours
            if (window.__mym_refresh_in_progress) {
              console.log("ℹ️ [MYM] Token refresh already in progress, skipping");
              return;
            }
            
            // Vérifier le cooldown (1 minute minimum entre chaque refresh)
            const now = Date.now();
            const lastRefresh = window.__mym_last_refresh || 0;
            if (now - lastRefresh < 60000) { // 1 minute
              console.log(`ℹ️ [MYM] Token refresh en cooldown (${Math.round((60000 - (now - lastRefresh)) / 1000)}s restantes)`);
              return;
            }
            
            window.__mym_refresh_in_progress = true;
            window.__mym_last_refresh = now;
            
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
          } finally {
            // Réinitialiser le flag après 2 secondes
            setTimeout(() => {
              window.__mym_refresh_in_progress = false;
            }, 2000);
          }
        })();
      }

      if (message.action === "applyTheme" && message.theme) {
        // Appliquer le thème sur la page
        applyThemeToCreatorsPage(message.theme);
      }

      if (message.action === "themeChanged" && message.theme) {
        // Appliquer le thème depuis la popup
        applyThemeToCreatorsPage(message.theme);
      }

      if (message.action === "toggleFeature") {
        // Gérer l'activation/désactivation d'une fonctionnalité
        handleFeatureToggle(message.feature, message.enabled);
      }

      if (message.action === "disableAllFeatures") {
        // Désactiver toutes les fonctionnalités
        // // console.log("🔄 [MYM] Disabling all features");
        
        // Désactiver les badges
        contentAPI.badgesEnabled = false;
        document.querySelectorAll('.mym-total-spent-badge, .mym-category-badge').forEach(el => el.remove());
        
        // Désactiver les stats
        contentAPI.statsEnabled = false;
        const statsBox = document.getElementById('mym-user-info-box');
        if (statsBox) statsBox.remove();
        
        // Désactiver les emojis
        contentAPI.emojiEnabled = false;
        if (contentAPI.emoji && contentAPI.emoji.removeEmojiUI) {
          contentAPI.emoji.removeEmojiUI();
        }
        
        // Désactiver les notes
        contentAPI.notesEnabled = false;
        document.querySelectorAll('.mym-notes-button').forEach(btn => btn.remove());
        const notesPanel = document.getElementById('mym-notes-panel');
        if (notesPanel) notesPanel.remove();
        
        // Désactiver la liste de conversations
        const conversationsList = document.querySelector('.mym-conversations-list');
        if (conversationsList) conversationsList.remove();
        
        // Arrêter le polling
        if (contentAPI.polling) {
          contentAPI.polling.stopPolling();
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
  }

  // ========================================
  // FEATURE TOGGLE HANDLER
  // ========================================
  function handleFeatureToggle(feature, enabled) {

    switch (feature) {
      case "mym_badges_enabled":
        // Mettre à jour le flag dans l'API
        contentAPI.badgesEnabled = enabled;
        
        if (enabled) {
          // Activer les badges - Vider les caches et rescanner
          if (contentAPI.badges) {
            if (contentAPI.badges.clearBadgeCaches) {
              contentAPI.badges.clearBadgeCaches();
            }
            // Laisser le DOM se stabiliser avant de scanner
            setTimeout(() => {
              if (contentAPI.badges.scanExistingListsForBadges) {
                contentAPI.badges.scanExistingListsForBadges();
              }
            }, 300);
          }
        } else {
          // Désactiver les badges (supprimer tous les badges affichés)
          document.querySelectorAll('.mym-total-spent-badge, .mym-category-badge').forEach(el => el.remove());
        }
        break;

      case "mym_stats_enabled":
        // Mettre à jour le flag dans l'API
        contentAPI.statsEnabled = enabled;
        
        if (enabled) {
          // Activer la box stats
          const username = contentAPI.getCurrentConversationUsername();
          if (username && contentAPI.stats && contentAPI.stats.injectUserInfoBox) {
            contentAPI.stats.injectUserInfoBox(username);
          }
        } else {
          // Désactiver la box stats (utiliser getElementById car c'est un ID, pas une classe)
          const statsBox = document.getElementById('mym-user-info-box');
          if (statsBox) statsBox.remove();
        }
        break;

      case "mym_emoji_enabled":
        // Mettre à jour le flag dans l'API
        contentAPI.emojiEnabled = enabled;
        
        if (enabled) {
          // Activer le picker emoji - Ajouter les boutons à tous les inputs existants
          if (contentAPI.emoji) {
            setTimeout(() => {
              const inputFields = document.querySelectorAll(".input__field");
              inputFields.forEach((field) => {
                if (!field.querySelector(".mym-emoji-trigger")) {
                  contentAPI.emoji.addEmojiButtonToInput(field);
                }
              });
            }, 300);
          }
        } else {
          // Désactiver le picker emoji
          if (contentAPI.emoji && contentAPI.emoji.removeEmojiUI) {
            contentAPI.emoji.removeEmojiUI();
          }
        }
        break;

      case "mym_notes_enabled":
        // Mettre à jour le flag dans l'API
        contentAPI.notesEnabled = enabled;
        
        if (enabled) {
          // Activer les notes
          setTimeout(() => {
            // Bouton dans le chat header
            if (contentAPI.notes && contentAPI.notes.createNotesButton) {
              contentAPI.notes.createNotesButton();
            }
            // Boutons dans la page /app/myms
            if (contentAPI.notes && contentAPI.notes.injectNotesButtonsInList) {
              contentAPI.notes.injectNotesButtonsInList();
            }
            // Boutons dans la liste de conversations (sidebar)
            if (contentAPI.conversations && contentAPI.conversations.reinjectNotesButtons) {
              contentAPI.conversations.reinjectNotesButtons();
            }
          }, 300);
        } else {
          // Désactiver les notes - Supprimer TOUS les boutons notes
          document.querySelectorAll('.mym-notes-button').forEach(btn => btn.remove());
          // Supprimer le panel s'il est ouvert
          const notesPanel = document.getElementById('mym-notes-panel');
          if (notesPanel) notesPanel.remove();
        }
        break;

      case "mym_live_enabled":
        if (enabled) {
          // Redémarrer le polling si sur page chat
          const isChatPage = window.location.pathname.startsWith("/app/chat/");
          if (isChatPage && contentAPI.polling) {
            contentAPI.polling.startPolling();
          }
        } else {
          // Arrêter le polling
          if (contentAPI.polling) {
            contentAPI.polling.stopPolling();
          }
        }
        break;

      default:
    }
  }

  // ========================================
  // THEME APPLICATION
  // ========================================
  const THEMES_MAP = {
    default: {
      name: "Violet",
      primary: "#667eea",
      secondary: "#764ba2",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    dark: {
      name: "Sombre",
      primary: "#181717ff",
      secondary: "#1d1d1dff",
      gradient: "linear-gradient(135deg, #5f5f5fff 0%, #1d1d1dff 100%)",
      background: "#0a0b0e",
      textColor: "#e5e7eb",
      textSecondary: "#d7dce6ff",
      cardBackground: "#626263ff",
      borderColor: "#2a2d3a",
    },
  };

  function applyThemeToCreatorsPage(themeName) {
    const theme = THEMES_MAP[themeName] || THEMES_MAP.default;
    
    let themeStyle = document.getElementById("mym-theme-style");
    if (!themeStyle) {
      themeStyle = document.createElement("style");
      themeStyle.id = "mym-theme-style";
      document.head.appendChild(themeStyle);
    }

    themeStyle.textContent = `
      /* Theme from mymchat.fr profile */
      :root {
        --mym-theme-primary: ${theme.primary} !important;
        --mym-theme-secondary: ${theme.secondary} !important;
        --mym-theme-gradient: ${theme.gradient} !important;
      }

      /* Extension buttons styling */
      .mym-notes-button,
      .mym-emoji-trigger,
      button[class*="mym-"],
      .button.button--primary {
        background: ${theme.gradient} !important;
        border: ${theme.gradient} 1px solid !important;
      }

      .mym-notes-button:hover,
      .mym-emoji-trigger:hover {
        opacity: 0.9 !important;
        transform: scale(1.05) !important;
      }

      /* MYM Native buttons - Nouveau button */
      .navigation__button.button-new--primary,
      button.button-new--primary {
        background: ${theme.gradient} !important;
        border: none !important;
      }

      .navigation__button.button-new--primary:hover,
      button.button-new--primary:hover {
        opacity: 0.9 !important;
        transform: translateY(-1px) !important;
      }

      /* Badge colors */
      .mym-total-spent-badge,
      .mym-category-badge {
        background: ${theme.gradient} !important;
      }

      /* Stats box styling */
      #mym-user-info-box {
        background: ${theme.gradient} !important;
        border-color: ${theme.primary} !important;
      }

      /* Selection highlight */
      ::selection {
        background: ${theme.primary} !important;
        color: white !important;
      }
    `;
    
    // Dispatcher un event pour notifier les modules du changement de thème
    const themeEvent = new CustomEvent('mymThemeChanged', { 
      detail: { themeName, theme } 
    });
    document.dispatchEvent(themeEvent);
  }

  let currentAppliedTheme = null;

  function syncThemeFromStorage() {
    chrome.storage.local.get(["user_theme"], (data) => {
      const themeName = data.user_theme || "default";
      currentAppliedTheme = themeName;
      applyThemeToCreatorsPage(themeName);
    });
  }

  // Réappliquer le thème quand de nouveaux boutons apparaissent
  function setupThemeObserver() {
    const themeObserver = new MutationObserver(() => {
      if (currentAppliedTheme) {
        // Vérifier si le style existe toujours
        const themeStyle = document.getElementById("mym-theme-style");
        if (!themeStyle) {
          console.log(`🔄 [MYM Content] Theme style removed, reapplying...`);
          applyThemeToCreatorsPage(currentAppliedTheme);
        }
      }
    });

    themeObserver.observe(document.head, {
      childList: true,
      subtree: false
    });
  }

  // Écouter les changements de thème depuis chrome.storage
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.user_theme) {
      const newTheme = changes.user_theme.newValue;
      console.log(`🎨 [MYM Content] Theme changed in storage: ${changes.user_theme.oldValue} → ${newTheme}`);
      if (newTheme) {
        currentAppliedTheme = newTheme;
        applyThemeToCreatorsPage(newTheme);
      }
    }
  });

  // Appliquer le thème au chargement de la page
  syncThemeFromStorage();
  
  // Setup observer pour surveiller la suppression du style
  setupThemeObserver();

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

  }

  window.addEventListener("beforeunload", cleanupAll);


  // ========================================
  // INITIALIZATION
  // ========================================
  (async function init() {

    // 1. Vérifier d'abord si les fonctionnalités sont activées (check background.js flags)
    const mainFlags = await contentAPI.safeStorageGet("local", [
      "mym_live_enabled",
      "mym_badges_enabled",
      "mym_stats_enabled",
      "mym_emoji_enabled",
      "mym_notes_enabled",
    ]);

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
      return;
    }

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

    // 5. Start central observer BEFORE initializing features
    if (contentAPI.centralObserver) {
      contentAPI.centralObserver.start();
    } else {
      console.warn("⚠️ [MYM] Central observer module not loaded");
    }

    // 6. Initialize features
    initializeObservers();

    // 7. Message polling is now handled by modules/auto-polling.js

    // 8. Setup background communication
    setupMessageListener();

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

