// content.js
// Detect chat id and poll for new messages,
// parse returned HTML and inject new messages into the current page.
(function () {
  "use strict";

  // Prevent multiple injections (avoid redirect loops)
  if (window.__MYM_EXTENSION_LOADED__) {
    return;
  }
  window.__MYM_EXTENSION_LOADED__ = true;

  // Boot (content script)
  // Inject a detector into page context to catch synchronous XHR usage
  try {
    if (window.chrome && chrome.runtime && chrome.runtime.getURL) {
      const url = chrome.runtime.getURL("detector.js");
      const s = document.createElement("script");
      s.src = url;
      s.onload = function () {
        try {
          this.remove();
        } catch (e) {}
      };
      (document.documentElement || document.head || document.body).appendChild(
        s
      );
    }
  } catch (e) {
    // silent fail — do not log to console
  }

  function getChatId() {
    const el = document.querySelector("[data-chat-id]");
    if (el) {
      const v = el.getAttribute("data-chat-id") || el.dataset.chatId;
      if (v) return v.toString();
    }
    const m = location.pathname.match(/\/app\/chat\/(\d+)/);
    if (m) return m[1];
    return null;
  }

  const chatId = getChatId();
  const isMymsPage =
    location.pathname.startsWith("/app/myms") ||
    document.querySelector(".page.my-myms") !== null;
  const isFollowersPage = location.pathname.startsWith(
    "/app/account/my-followers"
  );
  const isChatPage = !!chatId;

  if (!chatId && !isMymsPage && !isFollowersPage) {
    return; // not a page we handle
  }

  const MESSAGE_SELECTOR = ".chat-message[data-chat-message-id]";
  const LIST_ROW_SELECTOR = ".list__row";
  const CONTAINER_SELECTOR = ".discussions__chats";
  const DISCUSSIONS_SELECTOR = ".discussions, .page.my-myms";
  const NAV_SELECTOR = ".aside.sidebar, aside.sidebar";
  const POLL_INTERVAL_MS = 10000; // 10s (optimisé)
  const SUBSCRIPTION_CHECK_INTERVAL = 60 * 60 * 1000; // 1 heure
  const USER_INFO_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes (réduit pour éviter données obsolètes)
  const API_BASE = globalThis.APP_CONFIG?.API_BASE || "http://127.0.0.1:8080";

  let knownChatIds = new Set();
  let knownListIds = new Set();
  let pollHandle = null;
  let observer = null;
  let pollingInProgress = false;
  let discussionsInjected = false;
  
  // Références pour cleanup
  let footerObserver = null;
  let inputObserver = null;
  let notesButtonObserver = null;
  let urlObserver = null;
  let globalClickHandler = null;
  let popstateHandler = null;
  let messageListener = null;
  
  // LRU Cache implementation to prevent unlimited memory growth
  class LRUCache {
    constructor(maxSize = 100) {
      this.cache = new Map();
      this.maxSize = maxSize;
    }

    get(key) {
      if (!this.cache.has(key)) return null;
      const value = this.cache.get(key);
      // Move to end (most recent)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // Remove oldest (first)
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    clear() {
      this.cache.clear();
    }
    
    has(key) {
      return this.cache.has(key);
    }
    
    add(key) {
      this.set(key, true);
    }
    
    delete(key) {
      this.cache.delete(key);
    }
  }
  
  const totalSpentFetched = new LRUCache(100); // Track which users we've already fetched total spent for (limited to 100)
  const userInfoCache = new LRUCache(100); // Cache pour les infos utilisateur {username: {data, timestamp}}
  let userInfoBoxFetchController = null; // AbortController pour userInfoBox
  let badgeFetchController = null; // AbortController pour les badges

  // Feature flags
  let badgesEnabled = true;
  let statsEnabled = true;
  let emojiEnabled = true;
  let notesEnabled = true;
  let subscriptionMonitoringInterval = null;

  // 🔒 Vérification périodique du statut Premium/Trial
  function startSubscriptionMonitoring() {
    // Vérifier toutes les heures si l'abonnement est toujours actif
    if (subscriptionMonitoringInterval) return;
    
    subscriptionMonitoringInterval = setInterval(async () => {
      // Vérifier si le contexte est toujours valide
      if (!chrome.runtime?.id) {
        console.warn("[MYM] Extension context invalidated, stopping subscription monitoring");
        stopSubscriptionMonitoring();
        return;
      }
      
      const token = await getAccessToken();
      if (!token) return;

      try {
        const res = await fetch(API_BASE + "/check-subscription", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (res.status === 401) {
            // Token expiré, essayer de le rafraîchir
            console.log(
              "🔄 Token expiré lors de la vérification périodique, tentative de rafraîchissement..."
            );
            const refreshed = await tryRefreshToken(token);
            if (!refreshed) {
              // Si le rafraîchissement a échoué, afficher la bannière sans déconnecter
              console.log(
                "❌ Impossible de rafraîchir le token - Affichage bannière expiration"
              );
              showSubscriptionExpiredBanner();
              stopSubscriptionMonitoring();
              return;
            }
            // Réessayer avec le nouveau token
            const retryRes = await fetch(API_BASE + "/check-subscription", {
              headers: { Authorization: `Bearer ${refreshed}` },
            });
            if (!retryRes.ok) {
              showSubscriptionExpiredBanner();
              return;
            }
            const retryData = await retryRes.json();
            if (
              retryData.email_verified === false ||
              (!retryData.subscription_active &&
                retryData.trial_days_remaining <= 0)
            ) {
              showSubscriptionExpiredBanner();
            }
            return;
          }
          showSubscriptionExpiredBanner();
          return;
        }

        const data = await res.json();

        // Vérifier email_verified
        if (data.email_verified === false) {
          showSubscriptionExpiredBanner();
          return;
        }

        // Vérifier subscription ou trial
        if (!data.subscription_active && data.trial_days_remaining <= 0) {
          showSubscriptionExpiredBanner();
        }
      } catch (err) {
        console.error("Erreur vérification abonnement:", err);
      }
    }, SUBSCRIPTION_CHECK_INTERVAL);
  }
  
  function stopSubscriptionMonitoring() {
    if (subscriptionMonitoringInterval) {
      clearInterval(subscriptionMonitoringInterval);
      subscriptionMonitoringInterval = null;
    }
  }

  function getAccessToken() {
    return new Promise((resolve) => {
      // Vérifier si le contexte d'extension est valide
      if (!chrome.runtime?.id) {
        console.warn("[MYM] Extension context invalidated in getAccessToken");
        resolve(null);
        return;
      }
      
      if (typeof window.chrome !== "undefined" && window.chrome.storage) {
        try {
          window.chrome.storage.local.get(["access_token"], (items) => {
            if (chrome.runtime.lastError) {
              console.warn("[MYM] Error getting access token:", chrome.runtime.lastError);
              resolve(null);
              return;
            }
            resolve(items.access_token || null);
          });
        } catch (error) {
          console.warn("[MYM] Exception in getAccessToken:", error);
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  }

  // 🔄 Tenter de rafraîchir le token expiré en demandant à la page web
  async function tryRefreshToken(oldToken) {
    try {
      console.log("🔄 Demande de rafraîchissement du token à la page web...");

      // Ouvrir la page de signin dans un nouvel onglet caché pour obtenir un nouveau token
      return new Promise((resolve) => {
        const messageListener = (event) => {
          if (event.data && event.data.type === "FRESH_TOKEN_RESPONSE") {
            window.removeEventListener("message", messageListener);
            if (event.data.token) {
              // Sauvegarder le nouveau token
              window.chrome.storage.local.set(
                {
                  access_token: event.data.token,
                  access_token_stored_at: Date.now(),
                },
                () => {
                  console.log("✅ Token rafraîchi avec succès");
                  resolve(event.data.token);
                }
              );
            } else {
              resolve(null);
            }
          }
        };

        window.addEventListener("message", messageListener);

        // Demander un token frais via postMessage à la page
        window.postMessage({ type: "REQUEST_FRESH_TOKEN" }, "*");

        // Timeout après 5 secondes
        setTimeout(() => {
          window.removeEventListener("message", messageListener);
          console.warn("⏱️ Timeout du rafraîchissement de token");
          resolve(null);
        }, 5000);
      });
    } catch (err) {
      console.error("❌ Error refreshing token:", err);
    }
    return null;
  }

  // Fonction pour déconnecter l'utilisateur
  function logoutUser() {
    return new Promise((resolve) => {
      if (typeof window.chrome !== "undefined" && window.chrome.storage) {
        // Vérifier si on est dans une boucle de rechargement
        const reloadCount = sessionStorage.getItem('mym_reload_count') || '0';
        const lastReload = sessionStorage.getItem('mym_last_reload') || '0';
        const now = Date.now();
        const timeSinceLastReload = now - parseInt(lastReload);
        
        // Si plus de 3 rechargements en moins de 30 secondes, ne pas recharger
        if (parseInt(reloadCount) >= 3 && timeSinceLastReload < 30000) {
          console.warn("⚠️ Boucle de rechargement détectée - Arrêt du rechargement automatique");
          // Supprimer le token et les données utilisateur sans recharger
          window.chrome.storage.local.remove(
            ["access_token", "access_token_stored_at", "user_id", "user_email"],
            () => {
              console.log("🚪 Utilisateur déconnecté - Token expiré (sans rechargement)");
              showSubscriptionExpiredBanner();
              resolve();
            }
          );
          return;
        }
        
        // Incrémenter le compteur de rechargement
        const newCount = timeSinceLastReload < 30000 ? parseInt(reloadCount) + 1 : 1;
        sessionStorage.setItem('mym_reload_count', newCount.toString());
        sessionStorage.setItem('mym_last_reload', now.toString());
        
        // Supprimer le token et les données utilisateur
        window.chrome.storage.local.remove(
          ["access_token", "access_token_stored_at", "user_id", "user_email"],
          () => {
            console.log("🚪 Utilisateur déconnecté - Token expiré");
            // Recharger la page pour réinitialiser l'extension
            window.location.reload();
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  }

  // Fonctions pour gérer les catégories d'utilisateurs
  function getUserCategory(username) {
    return new Promise((resolve) => {
      if (typeof window.chrome !== "undefined" && window.chrome.storage) {
        window.chrome.storage.local.get(["user_categories"], (items) => {
          const categories = items.user_categories || {};
          resolve(categories[username] || null);
        });
      } else {
        resolve(null);
      }
    });
  }

  function setUserCategory(username, category) {
    return new Promise((resolve) => {
      if (typeof window.chrome !== "undefined" && window.chrome.storage) {
        window.chrome.storage.local.get(["user_categories"], (items) => {
          const categories = items.user_categories || {};

          if (category) {
            categories[username] = category;
          } else {
            delete categories[username];
          }

          window.chrome.storage.local.set(
            { user_categories: categories },
            () => {
              resolve();
            }
          );
        });
      } else {
        resolve();
      }
    });
  }

  async function verifySubscriptionStatus(token) {
    if (!token) return false;

    try {
      // Vérifier l'âge du token (max 30 jours)
      const result = await new Promise((resolve) => {
        window.chrome.storage.local.get(["access_token_stored_at"], (items) => {
          resolve(items.access_token_stored_at);
        });
      });

      if (result) {
        const tokenAge = Date.now() - result;
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
        if (tokenAge > maxAge) {
          return false;
        }
      }

      // Vérifier avec le backend
      //   "🔍 Validating token with backend:",
      //   token?.substring(0, 30) + "..."
      // );
      const res = await fetch(API_BASE + "/check-subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Token expiré, essayer de le rafraîchir
          console.log("🔄 Token expiré, tentative de rafraîchissement...");
          const refreshed = await tryRefreshToken(token);
          if (refreshed) {
            // Réessayer avec le nouveau token
            const retryRes = await fetch(API_BASE + "/check-subscription", {
              headers: { Authorization: `Bearer ${refreshed}` },
            });
            if (retryRes.ok) {
              const data = await retryRes.json();
              return data.email_verified !== false;
            }
          }
          // Si le rafraîchissement a échoué, retourner false sans déconnecter
          console.log(
            "❌ Impossible de rafraîchir le token - Retour false"
          );
        }
        return false;
      }

      const data = await res.json();

      // Vérifier email_verified
      if (data.email_verified === false) {
        return false;
      }

      // subscription_active OU trial_days_remaining > 0
      const isActive =
        data.subscription_active || data.trial_days_remaining > 0;

      if (!isActive) {
      }

      return isActive;
    } catch (err) {
      // En cas d'erreur réseau, on ne bloque pas pour éviter les faux positifs
      console.error("Erreur vérification abonnement (toléré):", err);
      return true; // Fail open
    }
  }

  function showSubscriptionExpiredBanner() {
    // Éviter les doublons
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

  // Démarrer le monitoring
  startSubscriptionMonitoring();

  // Emoji picker state
  let emojiPickerVisible = false;
  let currentInput = null;
  let emojiUsageCount = {}; // Track emoji usage frequency

  // Complete emoji list
  const EMOJI_LIST = [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "🤣",
    "😂",
    "🙂",
    "🙃",
    "😉",
    "😊",
    "😇",
    "🥰",
    "😍",
    "🤩",
    "😘",
    "😗",
    "☺️",
    "😚",
    "😙",
    "🥲",
    "😋",
    "😛",
    "😜",
    "🤪",
    "😝",
    "🤑",
    "🤗",
    "🤭",
    "🤫",
    "🤔",
    "🤐",
    "🤨",
    "😐",
    "😑",
    "😶",
    "😏",
    "😒",
    "🙄",
    "😬",
    "🤥",
    "😌",
    "😔",
    "😪",
    "🤤",
    "😴",
    "😷",
    "🤒",
    "🤕",
    "🤢",
    "🤮",
    "🤧",
    "🥵",
    "🥶",
    "🥴",
    "😵",
    "🤯",
    "🤠",
    "🥳",
    "🥸",
    "😎",
    "🤓",
    "🧐",
    "😕",
    "😟",
    "🙁",
    "☹️",
    "😮",
    "😯",
    "😲",
    "😳",
    "🥺",
    "😦",
    "😧",
    "😨",
    "😰",
    "😥",
    "😢",
    "😭",
    "😱",
    "😖",
    "😣",
    "😞",
    "😓",
    "😩",
    "😫",
    "🥱",
    "😤",
    "😡",
    "😠",
    "🤬",
    "😈",
    "👿",
    "💀",
    "☠️",
    "💩",
    "🤡",
    "👹",
    "👺",
    "👻",
    "👽",
    "👾",
    "🤖",
    "😺",
    "😸",
    "😹",
    "😻",
    "😼",
    "😽",
    "🙀",
    "😿",
    "😾",
    "🙈",
    "🙉",
    "🙊",
    "💋",
    "💌",
    "💘",
    "💝",
    "💖",
    "💗",
    "💓",
    "💞",
    "💕",
    "💟",
    "❣️",
    "💔",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🤎",
    "🖤",
    "🤍",
    "💯",
    "💢",
    "💥",
    "💫",
    "💦",
    "💨",
    "🕳️",
    "💣",
    "💬",
    "👁️‍🗨️",
    "🗨️",
    "🗯️",
    "💭",
    "💤",
    "👋",
    "🤚",
    "🖐️",
    "✋",
    "🖖",
    "👌",
    "🤌",
    "🤏",
    "✌️",
    "🤞",
    "🤟",
    "🤘",
    "🤙",
    "👈",
    "👉",
    "👆",
    "🖕",
    "👇",
    "☝️",
    "👍",
    "👎",
    "✊",
    "👊",
    "🤛",
    "🤜",
    "👏",
    "🙌",
    "👐",
    "🤲",
    "🤝",
    "🙏",
    "✍️",
    "💅",
    "🤳",
    "💪",
    "🦾",
    "🦿",
    "🦵",
    "🦶",
    "👂",
    "🦻",
    "👃",
    "🧠",
    "🫀",
    "🫁",
    "🦷",
    "🦴",
    "👀",
    "👁️",
    "👅",
    "👄",
    "👶",
    "🧒",
    "👦",
    "👧",
    "🧑",
    "👱",
    "👨",
    "🧔",
    "👨‍🦰",
    "👨‍🦱",
    "👨‍🦳",
    "👨‍🦲",
    "👩",
    "👩‍🦰",
    "👩‍🦱",
    "👩‍🦳",
    "👩‍🦲",
    "🧓",
    "👴",
    "👵",
    "🙍",
    "🙎",
    "🙅",
    "🙆",
    "💁",
    "🙋",
    "🧏",
    "🙇",
    "🤦",
    "🤷",
    "👮",
    "🕵️",
    "💂",
    "🥷",
    "👷",
    "🤴",
    "👸",
    "👳",
    "👲",
    "🧕",
    "🤵",
    "👰",
    "🤰",
    "🤱",
    "👼",
    "🎅",
    "🤶",
    "🦸",
    "🦹",
    "🧙",
    "🧚",
    "🧛",
    "🧜",
    "🧝",
    "🧞",
    "🧟",
    "💆",
    "💇",
    "🚶",
    "🧍",
    "🧎",
    "🏃",
    "💃",
    "🕺",
    "🕴️",
    "👯",
    "🧖",
    "🧗",
    "🤺",
    "🏇",
    "⛷️",
    "🏂",
    "🏌️",
    "🏄",
    "🚣",
    "🏊",
    "⛹️",
    "🏋️",
    "🚴",
    "🚵",
    "🤸",
    "🤼",
    "🤽",
    "🤾",
    "🤹",
    "🧘",
    "🛀",
    "🛌",
    "🎪",
    "🎭",
    "🎨",
    "🎬",
    "🎤",
    "🎧",
    "🎼",
    "🎹",
    "🥁",
    "🎷",
    "🎺",
    "🎸",
    "🪕",
    "🎻",
    "🎲",
    "♟️",
    "🎯",
    "🎳",
    "🎮",
    "🎰",
    "🧩",
    "🚗",
    "🚕",
    "🚙",
    "🚌",
    "🚎",
    "🏎️",
    "🚓",
    "🚑",
    "🚒",
    "🚐",
    "🛻",
    "🚚",
    "🚛",
    "🚜",
    "🦯",
    "🦽",
    "🦼",
    "🛴",
    "🚲",
    "🛵",
    "🏍️",
    "🛺",
    "🚨",
    "🚔",
    "🚍",
    "🚘",
    "🚖",
    "🚡",
    "🚠",
    "🚟",
    "🚃",
    "🚋",
    "🚞",
    "🚝",
    "🚄",
    "🚅",
    "🚈",
    "🚂",
    "🚆",
    "🚇",
    "🚊",
    "🚉",
    "✈️",
    "🛫",
    "🛬",
    "🛩️",
    "💺",
    "🛰️",
    "🚀",
    "🛸",
    "🚁",
    "🛶",
    "⛵",
    "🚤",
    "🛥️",
    "🛳️",
    "⛴️",
    "🚢",
    "⚓",
    "⛽",
    "🚧",
    "🚦",
    "🚥",
    "🗺️",
    "🗿",
    "🗽",
    "🗼",
    "🏰",
    "🏯",
    "🏟️",
    "🎡",
    "🎢",
    "🎠",
    "⛲",
    "⛱️",
    "🏖️",
    "🏝️",
    "🏜️",
    "🌋",
    "⛰️",
    "🏔️",
    "🗻",
    "🏕️",
    "⛺",
    "🏠",
    "🏡",
    "🏘️",
    "🏚️",
    "🏗️",
    "🏭",
    "🏢",
    "🏬",
    "🏣",
    "🏤",
    "🏥",
    "🏦",
    "🏨",
    "🏪",
    "🏫",
    "🏩",
    "💒",
    "🏛️",
    "⛪",
    "🕌",
    "🕍",
    "🛕",
    "🕋",
    "⛩️",
    "🛤️",
    "🛣️",
    "🗾",
    "🎑",
    "🏞️",
    "🌅",
    "🌄",
    "🌠",
    "🎇",
    "🎆",
    "🌇",
    "🌆",
    "🏙️",
    "🌃",
    "🌌",
    "🌉",
    "🌁",
    "⌚",
    "📱",
    "📲",
    "💻",
    "⌨️",
    "🖥️",
    "🖨️",
    "🖱️",
    "🖲️",
    "🕹️",
    "🗜️",
    "💽",
    "💾",
    "💿",
    "📀",
    "📼",
    "📷",
    "📸",
    "📹",
    "🎥",
    "📽️",
    "🎞️",
    "📞",
    "☎️",
    "📟",
    "📠",
    "📺",
    "📻",
    "🎙️",
    "🎚️",
    "🎛️",
    "🧭",
    "⏱️",
    "⏲️",
    "⏰",
    "🕰️",
    "⌛",
    "⏳",
    "📡",
    "🔋",
    "🔌",
    "💡",
    "🔦",
    "🕯️",
    "🪔",
    "🧯",
    "🛢️",
    "💸",
    "💵",
    "💴",
    "💶",
    "💷",
    "🪙",
    "💰",
    "💳",
    "💎",
    "⚖️",
    "🪜",
    "🧰",
    "🪛",
    "🔧",
    "🔨",
    "⚒️",
    "🛠️",
    "⛏️",
    "🪚",
    "🔩",
    "⚙️",
    "🪤",
    "🧱",
    "⛓️",
    "🧲",
    "🔫",
    "💣",
    "🧨",
    "🪓",
    "🔪",
    "🗡️",
    "⚔️",
    "🛡️",
    "🚬",
    "⚰️",
    "🪦",
    "⚱️",
    "🏺",
    "🔮",
    "📿",
    "🧿",
    "💈",
    "⚗️",
    "🔭",
    "🔬",
    "🕳️",
    "🩹",
    "🩺",
    "💊",
    "💉",
    "🩸",
    "🧬",
    "🦠",
    "🧫",
    "🧪",
    "🌡️",
    "🧹",
    "🪠",
    "🧺",
    "🧻",
    "🚽",
    "🚰",
    "🚿",
    "🛁",
    "🛀",
    "🧼",
    "🪒",
    "🧽",
    "🧴",
    "🛎️",
    "🔑",
    "🗝️",
    "🚪",
    "🪑",
    "🛋️",
    "🛏️",
    "🛌",
    "🧸",
    "🪆",
    "🖼️",
    "🪞",
    "🪟",
    "🛍️",
    "🛒",
    "🎁",
    "🎈",
    "🎏",
    "🎀",
    "🪄",
    "🪅",
    "🎊",
    "🎉",
    "🎎",
    "🏮",
    "🎐",
    "🧧",
    "✉️",
    "📩",
    "📨",
    "📧",
    "💌",
    "📥",
    "📤",
    "📦",
    "🏷️",
    "🪧",
    "📪",
    "📫",
    "📬",
    "📭",
    "📮",
    "📯",
    "📜",
    "📃",
    "📄",
    "📑",
    "🧾",
    "📊",
    "📈",
    "📉",
    "🗒️",
    "🗓️",
    "📆",
    "📅",
    "🗑️",
    "📇",
    "🗃️",
    "🗳️",
    "🗄️",
    "📋",
    "📁",
    "📂",
    "🗂️",
    "🗞️",
    "📰",
    "📓",
    "📔",
    "📒",
    "📕",
    "📗",
    "📘",
    "📙",
    "📚",
    "📖",
    "🔖",
    "🧷",
    "🔗",
    "📎",
    "🖇️",
    "📐",
    "📏",
    "🧮",
    "📌",
    "📍",
    "✂️",
    "🖊️",
    "🖋️",
    "✒️",
    "🖌️",
    "🖍️",
    "📝",
    "✏️",
    "🔍",
    "🔎",
    "🔏",
    "🔐",
    "🔒",
    "🔓",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "🤍",
    "🤎",
    "❤️‍🔥",
    "❤️‍🩹",
    "💔",
    "❣️",
    "💕",
    "💞",
    "💓",
    "💗",
    "💖",
    "💘",
    "💝",
    "💟",
    "☮️",
    "✝️",
    "☪️",
    "🕉️",
    "☸️",
    "✡️",
    "🔯",
    "🕎",
    "☯️",
    "☦️",
    "🛐",
    "⛎",
    "♈",
    "♉",
    "♊",
    "♋",
    "♌",
    "♍",
    "♎",
    "♏",
    "♐",
    "♑",
    "♒",
    "♓",
    "🆔",
    "⚛️",
    "🉑",
    "☢️",
    "☣️",
    "📴",
    "📳",
    "🈶",
    "🈚",
    "🈸",
    "🈺",
    "🈷️",
    "✴️",
    "🆚",
    "💮",
    "🉐",
    "㊙️",
    "㊗️",
    "🈴",
    "🈵",
    "🈹",
    "🈲",
    "🅰️",
    "🅱️",
    "🆎",
    "🆑",
    "🅾️",
    "🆘",
    "❌",
    "⭕",
    "🛑",
    "⛔",
    "📛",
    "🚫",
    "💯",
    "💢",
    "♨️",
    "🚷",
    "🚯",
    "🚳",
    "🚱",
    "🔞",
    "📵",
    "🚭",
    "❗",
    "❕",
    "❓",
    "❔",
    "‼️",
    "⁉️",
    "🔅",
    "🔆",
    "〽️",
    "⚠️",
    "🚸",
    "🔱",
    "⚜️",
    "🔰",
    "♻️",
    "✅",
    "🈯",
    "💹",
    "❇️",
    "✳️",
    "❎",
    "🌐",
    "💠",
    "Ⓜ️",
    "🌀",
    "💤",
    "🏧",
    "🚾",
    "♿",
    "🅿️",
    "🛗",
    "🈳",
    "🈂️",
    "🛂",
    "🛃",
    "🛄",
    "🛅",
    "🚹",
    "🚺",
    "🚼",
    "⚧️",
    "🚻",
    "🚮",
    "🎦",
    "📶",
    "🈁",
    "🔣",
    "ℹ️",
    "🔤",
    "🔡",
    "🔠",
    "🆖",
    "🆗",
    "🆙",
    "🆒",
    "🆕",
    "🆓",
    "0️⃣",
    "1️⃣",
    "2️⃣",
    "3️⃣",
    "4️⃣",
    "5️⃣",
    "6️⃣",
    "7️⃣",
    "8️⃣",
    "9️⃣",
    "🔟",
    "🔢",
    "#️⃣",
    "*️⃣",
    "⏏️",
    "▶️",
    "⏸️",
    "⏯️",
    "⏹️",
    "⏺️",
    "⏭️",
    "⏮️",
    "⏩",
    "⏪",
    "⏫",
    "⏬",
    "◀️",
    "🔼",
    "🔽",
    "➡️",
    "⬅️",
    "⬆️",
    "⬇️",
    "↗️",
    "↘️",
    "↙️",
    "↖️",
    "↕️",
    "↔️",
    "↪️",
    "↩️",
    "⤴️",
    "⤵️",
    "🔀",
    "🔁",
    "🔂",
    "🔄",
    "🔃",
    "🎵",
    "🎶",
    "➕",
    "➖",
    "➗",
    "✖️",
    "🟰",
    "♾️",
    "💲",
    "💱",
    "™️",
    "©️",
    "®️",
    "〰️",
    "➰",
    "➿",
    "🔚",
    "🔙",
    "🔛",
    "🔝",
    "🔜",
    "✔️",
    "☑️",
    "🔘",
    "🔴",
    "🟠",
    "🟡",
    "🟢",
    "🔵",
    "🟣",
    "⚫",
    "⚪",
    "🟤",
    "🔺",
    "🔻",
    "🔸",
    "🔹",
    "🔶",
    "🔷",
    "🔳",
    "🔲",
    "▪️",
    "▫️",
    "◾",
    "◽",
    "◼️",
    "◻️",
    "🟥",
    "🟧",
    "🟨",
    "🟩",
    "🟦",
    "🟪",
    "⬛",
    "⬜",
    "🟫",
    "🔈",
    "🔇",
    "🔉",
    "🔊",
    "🔔",
    "🔕",
    "📣",
    "📢",
    "👁️‍🗨️",
    "💬",
    "💭",
    "🗯️",
    "♠️",
    "♣️",
    "♥️",
    "♦️",
    "🃏",
    "🎴",
    "🀄",
    "🕐",
    "🕑",
    "🕒",
    "🕓",
    "🕔",
    "🕕",
    "🕖",
    "🕗",
    "🕘",
    "🕙",
    "🕚",
    "🕛",
    "🕜",
    "🕝",
    "🕞",
    "🕟",
    "🕠",
    "🕡",
    "🕢",
    "🕣",
    "🕤",
    "🕥",
    "🕦",
    "🕧",
  ];

  function scanExisting() {
    knownChatIds = new Set();
    knownListIds = new Set();
    document.querySelectorAll(MESSAGE_SELECTOR).forEach((node) => {
      const id =
        node.getAttribute("data-chat-message-id") || node.dataset.chatMessageId;
      if (id) knownChatIds.add(id.toString());
    });
    // collect existing list rows (myms page)
    document.querySelectorAll(LIST_ROW_SELECTOR).forEach((row) => {
      const a = row.querySelector("a[data-id]");
      const id = a && (a.getAttribute("data-id") || a.dataset.id);
      if (id) knownListIds.add(id.toString());
    });
  }

  // Scan existing list rows on the page and add badges
  async function scanExistingListsForBadges() {
    if (!badgesEnabled) return;

    // Find all list containers on the page (sidebar, main discussions, etc)
    const listContainers = document.querySelectorAll(
      ".discussions, .page.my-myms, [data-mym-injected='true'], .aside.sidebar, .content-body"
    );

    for (const container of listContainers) {
      // Look for .list__row instead of just links
      const rows = container.querySelectorAll(".list__row");
      //   "[MYM] Found",
      //   rows.length,
      //   "rows in container:",
      //   container.className
      // );

      for (const row of rows) {
        try {
          const link = row.querySelector('a[href*="/app/chat/"]');
          if (!link) continue;

          const username = extractUsername(link);

          if (!username || totalSpentFetched.has(username)) {
            continue;
          }

          totalSpentFetched.add(username);
          const info = await fetchUserDetailedInfo(username);

          if (info.totalSpent > 0) {
            addTotalSpentBadge(link, info.totalSpent, username);
          }
        } catch (err) {
          console.error("[MYM] Error processing row:", err);
        }
      }

      // Also look for .user-card (followers page)
      const userCards = container.querySelectorAll(".user-card");
      for (const card of userCards) {
        try {
          const link = card.querySelector('a[href*="/app/chat/"]');
          if (!link) continue;

          const username = extractUsernameFromCard(card);

          if (!username || totalSpentFetched.has(username)) {
            continue;
          }

          totalSpentFetched.add(username);
          const info = await fetchUserDetailedInfo(username);

          if (info.totalSpent > 0) {
            addTotalSpentBadgeToCard(card, info.totalSpent, username);
          }
        } catch (err) {
          console.error("[MYM] Error processing user card:", err);
        }
      }
    }
  }

  function injectMessageHtml(htmlString) {
    const container =
      document.querySelector(CONTAINER_SELECTOR) || document.body;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = htmlString;
    while (wrapper.firstElementChild) {
      const node = wrapper.firstElementChild;
      try {
        // apply a light animation class and remove it after animation ends
        // ensure the animation style is present
        if (!document.getElementById("mym-live-style")) {
          const style = document.createElement("style");
          style.id = "mym-live-style";
          style.textContent = `
            .mym-live-anim{animation: mym-appear 700ms ease both}
            @keyframes mym-appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
          `;
          document.head && document.head.appendChild(style);
        }
        node.classList.add("mym-live-anim");
        node.addEventListener(
          "animationend",
          function () {
            try {
              this.classList.remove("mym-live-anim");
            } catch (e) {}
          },
          { once: true }
        );
      } catch (e) {}
      container.appendChild(node);
    }
  }

  function handleFetchedHtml(html) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      if (isMymsPage) {
        // parse list rows
        const rows = Array.from(doc.querySelectorAll(LIST_ROW_SELECTOR));
        const newRows = rows.filter((r) => {
          const a = r.querySelector("a[data-id]");
          const id = a && (a.getAttribute("data-id") || a.dataset.id);
          return id && !knownListIds.has(id.toString());
        });
        if (newRows.length === 0) return;
        newRows.forEach((r) => {
          const a = r.querySelector("a[data-id]");
          const id = a && (a.getAttribute("data-id") || a.dataset.id);
          if (id) knownListIds.add(id.toString());
          injectMessageHtml(r.outerHTML);
        });
        return;
      }
      // default: chat page parsing
      const messages = Array.from(doc.querySelectorAll(MESSAGE_SELECTOR));
      const newMessages = messages.filter((m) => {
        const mid =
          m.getAttribute("data-chat-message-id") || m.dataset.chatMessageId;
        return mid && !knownChatIds.has(mid.toString());
      });
      if (newMessages.length === 0) return;
      newMessages.forEach((m) => {
        const mid = (
          m.getAttribute("data-chat-message-id") || m.dataset.chatMessageId
        ).toString();
        knownChatIds.add(mid);
        injectMessageHtml(m.outerHTML);
      });
      const container = document.querySelector(CONTAINER_SELECTOR);
      if (container) container.scrollTop = container.scrollHeight;
    } catch (err) {
      // silent fail — keep runtime console clean
    }
  }

  async function fetchChatDirect() {
    const url = isMymsPage
      ? `${location.origin}/app/myms`
      : `${location.origin}/app/chat/${chatId}`;
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`status=${r.status}`);
      const text = await r.text();
      return { html: text };
    } catch (err) {
      return { error: String(err) };
    }
  }

  async function fetchMymsPage() {
    const url = `${location.origin}/app/myms`;
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`status=${r.status}`);
      const text = await r.text();
      return { html: text };
    } catch (err) {
      return { error: String(err) };
    }
  }

  function injectDiscussionsList(doc) {
    const discussionsElement = doc.querySelector(DISCUSSIONS_SELECTOR);
    if (!discussionsElement) {
      return;
    }

    // Find sidebar__section directly
    let sidebarSection = document.querySelector(".sidebar__section");
    if (!sidebarSection) {
      return;
    }

    // Clear existing content from sidebar__section
    sidebarSection.innerHTML = "";

    // Remove old injected discussions if exists
    const oldWrapper = document.querySelector('[data-mym-wrapper="true"]');
    if (oldWrapper) {
      oldWrapper.remove();
    }

    // 🆕 Injecter la box d'information utilisateur avant la liste
    const currentUsername = getCurrentConversationUsername();
    if (currentUsername && badgesEnabled) {
      injectUserInfoBox(currentUsername);
    }

    // Clone and inject discussions
    const clonedDiscussions = discussionsElement.cloneNode(true);
    clonedDiscussions.setAttribute("data-mym-injected", "true");
    clonedDiscussions.style.cssText = `
      max-width: 100%;
      overflow-x: hidden;
    `;

    // Create a parent wrapper for the injected list
    const wrapperDiv = document.createElement("div");
    wrapperDiv.setAttribute("data-mym-wrapper", "true");
    wrapperDiv.style.cssText = `
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    // Append the cloned discussions to the wrapper
    wrapperDiv.appendChild(clonedDiscussions);

    // Inject wrapper into sidebar__section
    sidebarSection.appendChild(wrapperDiv);

    // Set flex properties on sidebar__section to fill space
    sidebarSection.style.cssText =
      "flex: 1; min-height: 0; display: flex; flex-direction: column;";

    discussionsInjected = true;

    // Fetch pending income for each user in the list
    fetchPendingIncomeForUsers(clonedDiscussions);
  }

  async function fetchPendingIncomeForUsers(discussionsContainer) {
    if (!badgesEnabled) return;

    // Find all .list__row in the injected discussions list
    const rows = discussionsContainer.querySelectorAll(".list__row");

    for (const row of rows) {
      try {
        const link = row.querySelector('a[href*="/app/chat/"]');
        if (!link) continue;

        // Make entire row clickable
        makeRowClickable(row, link);

        const username = extractUsername(link);

        if (!username || totalSpentFetched.has(username)) {
          //   "[MYM] Skipping",
          //   username,
          //   "- already fetched or invalid"
          // );
          continue;
        }

        totalSpentFetched.add(username);
        const info = await fetchUserDetailedInfo(username);

        // Add badge only if amount > 0
        if (info.totalSpent > 0) {
          addTotalSpentBadge(link, info.totalSpent, username);
        }
      } catch (err) {
        console.error("[MYM] Error processing user:", err);
        // silent fail
      }
    }
  }

  function makeRowClickable(row, link) {
    // Add cursor pointer style
    row.style.cursor = "pointer";

    // Add click event to entire row
    row.addEventListener("click", (e) => {
      // Don't trigger if clicking directly on the link or its children
      if (e.target.closest('a[href*="/app/chat/"]')) {
        return;
      }

      // Navigate to the chat
      const href = link.getAttribute("href");
      if (href) {
        window.location.href = href;
      }
    });

    // Add hover effect
    row.addEventListener("mouseenter", () => {
      row.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
    });

    row.addEventListener("mouseleave", () => {
      row.style.backgroundColor = "";
    });
  }

  function extractUsername(link) {
    // Find parent .list__row to get username
    const row = link.closest(".list__row");
    if (row) {
      // Try multiple selectors in order of specificity
      const selectors = [
        ".nickname_profile span.js-nickname-placeholder",
        ".nickname_profile .js-nickname-placeholder",
        ".list__row__label .js-nickname-placeholder",
        "span.js-nickname-placeholder",
      ];

      for (const selector of selectors) {
        const nicknameEl = row.querySelector(selector);
        if (nicknameEl) {
          const username = nicknameEl.textContent.trim();
          if (username && username.length > 1) {
            // Ignore single letters
            //   "[MYM] Extracted username via",
            //   selector,
            //   ":",
            //   username
            // );
            return username;
          }
        }
      }
    }

    // Fallback: try to get username from link text or href
    const text = link.textContent.trim();
    if (text.startsWith("@")) return text.substring(1);

    // Try from href: /app/chat/fan/123/init or similar
    const href = link.getAttribute("href");
    const match = href && href.match(/\/app\/chat\/(?:fan\/\d+\/)?([^\/]+)/);
    return match ? match[1] : text;
  }

  function extractUsernameFromCard(card) {
    // For .user-card, look for .nickname_profile span
    const nicknameEl = card.querySelector(
      ".nickname_profile span.js-nickname-placeholder"
    );
    if (nicknameEl) {
      const username = nicknameEl.textContent.trim();
      if (username && username.length > 1) {
        return username;
      }
    }
    return null;
  }

  async function addTotalSpentBadgeToCard(card, totalSpent, username) {
    // Check if badge already exists
    if (card.querySelector(".mym-total-spent-badge")) {
      return;
    }

    // Récupérer la catégorie de l'utilisateur
    const category = await getUserCategory(username);
    const categoryEmojis = {
      TW: "⏱️",
      SP: "💰",
      Whale: "🐋",
    };

    const badge = document.createElement("div");
    badge.className = "mym-total-spent-badge";
    badge.style.cssText = `
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
      vertical-align: middle;
    `;
    badge.textContent = `${
      category ? categoryEmojis[category] + " " : ""
    }${totalSpent.toFixed(2)}€`;
    badge.title = `Revenu total de ${username}: ${totalSpent.toFixed(2)}€`;

    // Insert badge after the nickname
    const nicknameContainer = card.querySelector(
      ".user-card__nickname-container"
    );
    if (nicknameContainer) {
      nicknameContainer.appendChild(badge);
    }
  }

  // 🆕 Récupérer le nom d'utilisateur de la conversation actuelle
  function getCurrentConversationUsername() {
    // Méthode 1: Depuis le header nickname/pseudo dans la zone de chat
    const chatHeaderNickname = document.querySelector(
      ".chat__header .nickname_profile, .content-search-bar .nickname_profile, main .nickname_profile"
    );
    if (chatHeaderNickname) {
      // Le texte contient soit @username soit juste le username
      let username = chatHeaderNickname.textContent.trim();
      // Nettoyer les emojis et espaces
      username = username.replace(/[^\w@_.-]/g, "");
      if (username.startsWith("@")) {
        username = username.substring(1);
      }
      if (username && username.length > 0 && !username.match(/^\d+$/)) {
        return username;
      }
    }

    // Méthode 2: Depuis le lien "Voir le profil" ou similaire
    const profileLinks = document.querySelectorAll('a[href*="/app/chat/fan/"]');
    for (const link of profileLinks) {
      const linkText = link.textContent.trim();
      if (linkText.startsWith("@")) {
        const username = linkText.substring(1);
        if (username.length > 0) {
          return username;
        }
      }
    }

    // Méthode 3: Depuis l'URL pour les pages /app/chat/username (ancienne structure)
    const urlMatch = location.pathname.match(/\/app\/chat\/([^\/]+)$/);
    if (
      urlMatch &&
      urlMatch[1] &&
      urlMatch[1] !== "fan" &&
      !urlMatch[1].match(/^\d+$/)
    ) {
      return urlMatch[1];
    }

    // Méthode 4: Extraire depuis les éléments de la sidebar active
    const activeConversation = document.querySelector(
      '.list__row.is-active a[href*="/app/chat/"]'
    );
    if (activeConversation) {
      const nickname = activeConversation.querySelector(".nickname_profile");
      if (nickname) {
        let username = nickname.textContent.trim().replace(/[^\w@_.-]/g, "");
        if (username.startsWith("@")) username = username.substring(1);
        if (username && !username.match(/^\d+$/)) {
          return username;
        }
      }
    }

    return null;
  }

  // 🆕 Récupérer les informations détaillées d'un utilisateur (abonnement, médias, etc.)
  async function fetchUserDetailedInfo(username, forceRefresh = false, source = 'badge') {
    // Utiliser le bon AbortController selon la source
    let controller, currentController;
    if (source === 'userInfoBox') {
      currentController = userInfoBoxFetchController;
      // Annuler la requête userInfoBox précédente si elle existe
      if (userInfoBoxFetchController) {
        userInfoBoxFetchController.abort();
      }
      userInfoBoxFetchController = new AbortController();
      controller = userInfoBoxFetchController;
    } else {
      currentController = badgeFetchController;
      // Pour les badges, ne pas annuler - laisser les requêtes se terminer
      badgeFetchController = new AbortController();
      controller = badgeFetchController;
    }
    
    const signal = controller.signal;
    
    // Vérifier le cache (sauf si forceRefresh)
    if (!forceRefresh) {
      const cached = userInfoCache.get(username);
      if (cached && Date.now() - cached.timestamp < USER_INFO_CACHE_DURATION) {
        // Nettoyer le controller approprié
        if (source === 'userInfoBox') {
          userInfoBoxFetchController = null;
        } else {
          badgeFetchController = null;
        }
        return cached.data;
      }
    }

    const info = {
      username: username,
      isSubscribed: false,
      totalSpent: 0,
      mediaPrivate: 0,
      mediaPush: 0,
      mediaOnDemand: 0,
      subscription: 0,
      subscriptionRenewal: 0,
      tips: 0, // Pourboires
      consultation: 0, // Consultation
      firstSubscriptionDate: null,
    };

    try {
      // Fetch income details page
      const url = `${
        location.origin
      }/app/income-details?search=${encodeURIComponent(username)}`;
      const response = await fetch(url, { 
        credentials: "include",
        signal: signal
      });

      if (!response.ok) {
        //   "[MYM] Failed to fetch user info, status:",
        //   response.status
        // );
        // Nettoyer le bon controller
        if (source === 'userInfoBox') {
          userInfoBoxFetchController = null;
        } else {
          badgeFetchController = null;
        }
        return info;
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Parcourir toutes les pages pour récupérer les informations
      let currentPage = 1;
      let hasMorePages = true;
      const maxPages = 10; // Limite de sécurité (optimisé pour performance)

      while (hasMorePages && currentPage <= maxPages) {
        const pageUrl = currentPage === 1 ? url : `${url}&page=${currentPage}`;
        const pageResponse = await fetch(pageUrl, { 
          credentials: "include",
          signal: signal
        });

        if (!pageResponse.ok) break;

        const pageHtml = await pageResponse.text();
        const pageDoc = parser.parseFromString(pageHtml, "text/html");

        // Récupérer toutes les cartes de revenus
        const incomeCards = pageDoc.querySelectorAll(".card-income");

        if (incomeCards.length === 0) {
          hasMorePages = false;
          break;
        }

        incomeCards.forEach((card) => {
          // Récupérer le type de revenu - le HTML utilise --title ou --type
          const typeElement =
            card.querySelector(".card-income__info--title") ||
            card.querySelector(".card-income__info--type");
          const amountElement = card.querySelector(
            ".card-income__info--amount"
          );
          const dateElement = card.querySelector(".card-income__info--date");

          if (!typeElement || !amountElement) return;

          const type = typeElement.textContent.trim().toLowerCase();
          const amountText = amountElement.textContent.trim();

          // Extraire le montant (format: +7,32 € ou 7,32 € ou 0 €)
          const match = amountText.match(/([+-]?\d+[\s,\.]*\d*)\s*€/);

          if (!match) return;

          const amount = parseFloat(
            match[1].replace(/\s/g, "").replace(",", ".")
          );

          // Pour les abonnements, autoriser 0€ (abonnement gratuit)
          const isSubscriptionType =
            type.includes("abonnement") ||
            type.includes("subscription") ||
            type.includes("renouvellement");

          // Filtrer les montants invalides (sauf abonnements gratuits à 0€)
          if (isNaN(amount)) return;
          if (amount < 0) return; // Pas de montants négatifs
          if (amount === 0 && !isSubscriptionType) return; // 0€ autorisé seulement pour abonnements

          // Vérifier le statut (validé ou en attente)
          const isDone =
            card.querySelector(".card-income__info--status-done") !== null;
          const isPending =
            card.querySelector(".card-income__info--status-pending") !== null;

          // Ajouter au total (seulement si validé ou en attente ET montant > 0)
          if ((isDone || isPending) && amount > 0) {
            info.totalSpent += amount;
          }

          // Catégoriser par type
          if (type.includes("privé") || type.includes("private")) {
            info.mediaPrivate += amount;
          } else if (type.includes("push")) {
            info.mediaPush += amount;
          } else if (
            type.includes("on demand") ||
            type.includes("à la demande")
          ) {
            info.mediaOnDemand += amount;
          } else if (type.includes("pourboire") || type.includes("tip")) {
            info.tips += amount;
          } else if (type.includes("consultation")) {
            info.consultation += amount;
          } else if (type.includes("renouvellement")) {
            // Renouvellement doit être testé AVANT abonnement
            if (amount > 0) {
              info.subscriptionRenewal += amount;
            }
            info.isSubscribed = true; // Marquer comme abonné même si gratuit
          } else if (
            type.includes("abonnement") ||
            type.includes("subscription")
          ) {
            if (amount > 0) {
              info.subscription += amount;
            }
            info.isSubscribed = true; // Marquer comme abonné même si gratuit

            // Récupérer la date du premier abonnement
            if (dateElement && !info.firstSubscriptionDate) {
              // Essayer de récupérer la version desktop (plus lisible)
              const desktopDate = dateElement.querySelector(
                ".date-responive-desktop"
              );
              if (desktopDate) {
                info.firstSubscriptionDate = desktopDate.textContent.trim();
              } else {
                // Sinon utiliser la version mobile
                const mobileDate = dateElement.querySelector(
                  "time.date-responive-mobile"
                );
                if (mobileDate) {
                  info.firstSubscriptionDate = mobileDate.textContent.trim();
                }
              }
            }
          }
        });

        currentPage++;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Mettre en cache les résultats
      userInfoCache.set(username, {
        data: info,
        timestamp: Date.now(),
      });

      // Nettoyer le bon controller
      if (source === 'userInfoBox') {
        userInfoBoxFetchController = null;
      } else {
        badgeFetchController = null;
      }
      
      return info;
    } catch (err) {
      // Nettoyer le bon controller
      if (source === 'userInfoBox') {
        userInfoBoxFetchController = null;
      } else {
        badgeFetchController = null;
      }
      
      if (err.name === 'AbortError') {
        return null;
      }
      return info;
    }
  }

  // 🆕 Créer et injecter la box d'information utilisateur
  let isUpdatingUserInfoBox = false;
  let currentUserInfoBoxUsername = null; // Track current username to avoid unnecessary updates

  async function injectUserInfoBox(username) {
    if (!username) {
      return;
    }

    // Éviter les boucles infinies et les appels multiples
    if (isUpdatingUserInfoBox && currentUserInfoBoxUsername === username) {
      return;
    }

    // Vérifier si la fonctionnalité stats est activée
    if (!statsEnabled) {
      // Si désactivée, supprimer la box si elle existe
      const existingBox = document.getElementById("mym-user-info-box");
      if (existingBox) {
        existingBox.remove();
      }
      currentUserInfoBoxUsername = null;
      return;
    }

    isUpdatingUserInfoBox = true;
    currentUserInfoBoxUsername = username;
    console.log('[MYM] 🔒 Flags set - isUpdatingUserInfoBox:', isUpdatingUserInfoBox, 'currentUserInfoBoxUsername:', currentUserInfoBoxUsername);

    try {
      // Vérifier si la box existe déjà
      let userInfoBox = document.getElementById("mym-user-info-box");

      if (!userInfoBox) {
        // Créer la box
        userInfoBox = document.createElement("div");
        userInfoBox.id = "mym-user-info-box";
        userInfoBox.style.cssText = `
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 8px;
          margin-bottom: 8px;
          color: white;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;
        
        // Insérer la box dans le sidebar
        const sidebarSection = document.querySelector(".sidebar__section");
        if (sidebarSection) {
          sidebarSection.insertBefore(userInfoBox, sidebarSection.firstChild);
        } else {
          // Si pas de sidebar, annuler
          isUpdatingUserInfoBox = false;
          currentUserInfoBoxUsername = null;
          return;
        }
      }

      // Afficher un loader
      userInfoBox.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 14px; opacity: 0.9;">⏳ Chargement des informations...</div>
        </div>
      `;

      // Récupérer les informations
      const info = await fetchUserDetailedInfo(username, false, 'userInfoBox');

      // Vérifier que c'est toujours le bon utilisateur (éviter les race conditions)
      if (currentUserInfoBoxUsername !== username) {
        isUpdatingUserInfoBox = false;
        return;
      }
      
      // Vérifier que info n'est pas null (peut être null si fetch avorté)
      if (!info) {
        // Réinitialiser les flags pour permettre un nouveau chargement
        isUpdatingUserInfoBox = false;
        currentUserInfoBoxUsername = null;
        // Ne pas afficher de message - le fetch a été avorté car l'utilisateur a changé
        // Une nouvelle requête est probablement déjà en cours pour le bon utilisateur
        return;
      }

      // Récupérer la catégorie actuelle de l'utilisateur
      const userCategory = await getUserCategory(username);

    // Déterminer le type d'abonnement
    let subscriptionBadge = "";
    if (info.subscriptionRenewal > 0) {
      // A des renouvellements = abonné payant récurrent
      subscriptionBadge =
        '<span style="background: rgba(34, 197, 94, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">🔄 RENOUVELÉ</span>';
    } else if (info.subscription > 0) {
      // A un abonnement mais pas de renouvellement = abonné payant initial
      subscriptionBadge =
        '<span style="background: rgba(59, 130, 246, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">💰 PAYANT</span>';
    } else if (info.isSubscribed) {
      // Abonné mais pas de transaction = abonnement gratuit
      subscriptionBadge =
        '<span style="background: rgba(251, 191, 36, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">🎁 GRATUIT</span>';
    } else {
      // Non abonné
      subscriptionBadge =
        '<span style="background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">○ NON ABONNÉ</span>';
    }

    // Afficher les informations
    userInfoBox.innerHTML = `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
          <div style="font-size: 14px; font-weight: 700;">
            👤 ${info.username}
          </div>
          <button class="mym-refresh-info" title="Rafraîchir les informations" style="
            background: rgba(255, 255, 255, 0.1);
            border: none;
            border-radius: 4px;
            padding: 4px 8px;
            color: white;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
          ">🔄</button>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${subscriptionBadge}
          <!-- Système de catégorisation -->
          <div style="display: flex; gap: 2px; flex: 1;">
            <button class="mym-category-btn" data-category="TW" style="
              flex: 1;
              padding: 2px;
              border: none;
              background: ${
                userCategory === "TW" ? "#ef4444" : "rgba(239, 68, 68, 0.3)"
              };
              color: white;
              border-radius: 3px;
              font-size: 16px;
              line-height: 1;
              cursor: pointer;
              transition: all 0.2s;
              box-shadow: ${
                userCategory === "TW" ? "0 1px 3px rgba(0,0,0,0.2)" : "none"
              };
            ">
              ⏱️
            </button>
            <button class="mym-category-btn" data-category="SP" style="
              flex: 1;
              padding: 2px;
              border: none;
              background: ${
                userCategory === "SP" ? "#10b981" : "rgba(16, 185, 129, 0.3)"
              };
              color: white;
              border-radius: 3px;
              font-size: 16px;
              line-height: 1;
              cursor: pointer;
              transition: all 0.2s;
              box-shadow: ${
                userCategory === "SP" ? "0 1px 3px rgba(0,0,0,0.2)" : "none"
              };
            ">
              💰
            </button>
            <button class="mym-category-btn" data-category="Whale" style="
              flex: 1;
              padding: 2px;
              border: none;
              background: ${
                userCategory === "Whale" ? "#3b82f6" : "rgba(59, 130, 246, 0.3)"
              };
              color: white;
              border-radius: 3px;
              font-size: 16px;
              line-height: 1;
              cursor: pointer;
              transition: all 0.2s;
              box-shadow: ${
                userCategory === "Whale" ? "0 1px 3px rgba(0,0,0,0.2)" : "none"
              };
            ">
              🐋
            </button>
          </div>
        </div>
        ${
          info.firstSubscriptionDate
            ? `<div style="font-size: 11px; opacity: 0.85; margin-top: 4px;">📅 Premier abo: ${info.firstSubscriptionDate}</div>`
            : ""
        }
      </div>
      
      <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
        <div style="background: rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 8px; flex: 1; box-sizing: border-box;">
          <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; opacity: 0.9;">💰 Total dépensé</div>
          <div style="font-size: 18px; font-weight: 700;">${info.totalSpent.toFixed(
            2
          )} €</div>
        </div>
        <button id="mym-toggle-details" style="
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          padding: 8px 12px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        ">▼</button>
      </div>

      <div id="mym-details-container" style="display: none; overflow: hidden; transition: all 0.3s;">
        <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px;">
          <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px); box-sizing: border-box;">
            <div style="opacity: 0.75; margin-bottom: 2px;">📬 Médias push</div>
            <div style="font-weight: 600;">${info.mediaPush.toFixed(2)} €</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px); box-sizing: border-box;">
            <div style="opacity: 0.75; margin-bottom: 2px;">⭐ Abonnements</div>
            <div style="font-weight: 600;">${info.subscription.toFixed(
              2
            )} €</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px); box-sizing: border-box;">
            <div style="opacity: 0.75; margin-bottom: 2px;">🔄 Renouvellements</div>
            <div style="font-weight: 600;">${info.subscriptionRenewal.toFixed(
              2
            )} €</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px); box-sizing: border-box;">
            <div style="opacity: 0.75; margin-bottom: 2px;">🎬 À la demande</div>
            <div style="font-weight: 600;">${info.mediaOnDemand.toFixed(
              2
            )} €</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px); box-sizing: border-box;">
            <div style="opacity: 0.75; margin-bottom: 2px;">🔒 Médias privés</div>
            <div style="font-weight: 600;">${info.mediaPrivate.toFixed(
              2
            )} €</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px); box-sizing: border-box;">
            <div style="opacity: 0.75; margin-bottom: 2px;">💝 Pourboires</div>
            <div style="font-weight: 600;">${info.tips.toFixed(2)} €</div>
          </div>
          ${
            info.consultation > 0
              ? `
          <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px); box-sizing: border-box;">
            <div style="opacity: 0.75; margin-bottom: 2px;">📞 Consultation</div>
            <div style="font-weight: 600;">${info.consultation.toFixed(
              2
            )} €</div>
          </div>
          `
              : ""
          }
        </div>
      </div>
    `;

    // Ajouter l'event listener pour le bouton de rafraîchissement
    const refreshBtn = userInfoBox.querySelector(".mym-refresh-info");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        refreshBtn.textContent = "⏳";
        refreshBtn.disabled = true;
        
        // Vider le cache pour cet utilisateur
        userInfoCache.delete(username);
        
        // Rafraîchir les informations
        await injectUserInfoBox(username);
        
        setTimeout(() => {
          refreshBtn.textContent = "🔄";
          refreshBtn.disabled = false;
        }, 500);
      });
      
      refreshBtn.addEventListener("mouseenter", () => {
        refreshBtn.style.background = "rgba(255, 255, 255, 0.2)";
      });
      refreshBtn.addEventListener("mouseleave", () => {
        refreshBtn.style.background = "rgba(255, 255, 255, 0.1)";
      });
    }

    // Ajouter les event listeners pour les boutons de catégorie
    const categoryButtons = userInfoBox.querySelectorAll(".mym-category-btn");
    categoryButtons.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const clickedCategory = e.target.getAttribute("data-category");

        // Si c'est déjà la catégorie active, on la désélectionne
        const newCategory =
          clickedCategory === userCategory ? "" : clickedCategory;

        // Sauvegarder la catégorie
        await setUserCategory(username, newCategory);

        // Forcer le rechargement complet de la box
        const existingBox = document.getElementById("mym-user-info-box");
        if (existingBox) {
          existingBox.remove();
        }
        await injectUserInfoBox(username);
      });
    });

    // Ajouter l'event listener pour le bouton toggle
    const toggleBtn = userInfoBox.querySelector("#mym-toggle-details");
    const detailsContainer = userInfoBox.querySelector(
      "#mym-details-container"
    );

    if (toggleBtn && detailsContainer) {
      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = detailsContainer.style.display !== "none";

        if (isVisible) {
          detailsContainer.style.display = "none";
          toggleBtn.textContent = "▼";
        } else {
          detailsContainer.style.display = "block";
          toggleBtn.textContent = "▲";
        }
      });
    }
    } catch (error) {
      console.error("[MYM] Error updating user info box:", error);
      // En cas d'erreur, afficher un message dans la box
      const userInfoBox = document.getElementById("mym-user-info-box");
      if (userInfoBox) {
        userInfoBox.innerHTML = `
          <div style="text-align: center; padding: 8px;">
            <div style="font-size: 14px; opacity: 0.9;">❌ Erreur de chargement</div>
            <button onclick="this.parentElement.parentElement.remove()" style="
              margin-top: 8px;
              padding: 4px 8px;
              background: rgba(255,255,255,0.2);
              border: none;
              border-radius: 4px;
              color: white;
              cursor: pointer;
              font-size: 12px;
            ">Fermer</button>
          </div>
        `;
      }
    } finally {
      // Toujours réinitialiser le flag, même en cas d'erreur
      isUpdatingUserInfoBox = false;
    }
  }

  async function addTotalSpentBadge(link, amount, username) {
    // Find the row container
    const row = link.closest(".list__row");
    if (!row) {
      return;
    }

    // Check if badge already exists
    if (row.querySelector(".mym-total-spent-badge")) {
      return;
    }

    // Find the nickname container - try multiple selectors
    let nicknameContainer =
      row.querySelector(".nickname_profile") ||
      row.querySelector(".list__row__label") ||
      row.querySelector(".js-nickname-placeholder")?.parentElement ||
      row.querySelector("[class*='nickname']") ||
      row.querySelector("[class*='label']");

    if (!nicknameContainer) {
      // Fallback: try to find any text container in the row
      nicknameContainer = row.querySelector(".list__row__content") || row;
    }

    //   "[MYM] Found nickname container for",
    //   username,
    //   nicknameContainer
    // );

    // Récupérer la catégorie de l'utilisateur
    const category = await getUserCategory(username);
    const categoryEmojis = {
      TW: "⏱️",
      SP: "💰",
      Whale: "🐋",
    };

    const badge = document.createElement("span");
    badge.className = "mym-total-spent-badge";
    badge.textContent = `${
      category ? categoryEmojis[category] + " " : ""
    }${amount.toFixed(2)} €`;
    badge.style.cssText = `
      display: inline-block !important;
      background: #10b981 !important;
      color: white !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      padding: 3px 8px !important;
      border-radius: 12px !important;
      margin-left: 8px !important;
      vertical-align: middle !important;
      z-index: 9999 !important;
      white-space: nowrap !important;
      line-height: 1.2 !important;
      position: relative !important;
      opacity: 1 !important;
      visibility: visible !important;
    `;

    // Insert badge at the end of the nickname_profile container
    nicknameContainer.appendChild(badge);
  }

  // Process a single row to add badge (used for dynamically added rows)
  async function processRowForBadge(row) {
    if (!badgesEnabled) return;
    try {
      const link = row.querySelector('a[href*="/app/chat/"]');
      if (!link) return;

      const username = extractUsername(link);
      if (!username || totalSpentFetched.has(username)) {
        return;
      }

      totalSpentFetched.add(username);
      const info = await fetchUserDetailedInfo(username);

      if (info.totalSpent > 0) {
        addTotalSpentBadge(link, info.totalSpent, username);
      }
    } catch (err) {
      console.error("[MYM] Error processing row for badge:", err);
    }
  }

  async function processCardForBadge(card) {
    if (!badgesEnabled) return;
    try {
      const link = card.querySelector('a[href*="/app/chat/"]');
      if (!link) return;

      const username = extractUsernameFromCard(card);
      if (!username || totalSpentFetched.has(username)) {
        return;
      }

      totalSpentFetched.add(username);
      const info = await fetchUserDetailedInfo(username);

      if (info.totalSpent > 0) {
        addTotalSpentBadgeToCard(card, info.totalSpent, username);
      }
    } catch (err) {
      console.error("[MYM] Error processing card for badge:", err);
    }
  }

  // Add badge to chat header in main content area
  // DISABLED: Badge is now shown in the statistics box instead
  async function addBadgeToChatHeader() {
    // Function disabled to avoid duplicate with statistics box
    return;

    /* Original code commented out
    if (!badgesEnabled || !isChatPage) return;

    // Find the username in the chat header
    const selectors = [
      "main .nickname_profile",
      ".content-search-bar .nickname_profile",
      ".chat-header .nickname_profile",
    ];

    let nicknameContainer = null;
    for (const selector of selectors) {
      nicknameContainer = document.querySelector(selector);
      if (nicknameContainer) break;
    }

    if (!nicknameContainer) {
      return;
    }

    // Check if badge already exists
    if (nicknameContainer.querySelector(".mym-total-spent-badge-header")) {
      return;
    }

    // Extract username
    const usernameEl = nicknameContainer.querySelector(
      ".js-nickname-placeholder"
    );
    if (!usernameEl) {
      return;
    }

    const username = usernameEl.textContent.trim();
    if (!username || username.length <= 1) {
      return;
    }


    // Fetch total spent
    const total = await fetchUserTotalSpent(username);

    if (total <= 0) {
      return;
    }

    // Create badge
    const badge = document.createElement("span");
    badge.className = "mym-total-spent-badge-header";
    badge.textContent = `${total.toFixed(2)} €`;
    badge.style.cssText = `
      display: inline-block;
      background: #10b981;
      color: white;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 12px;
      margin-left: 10px;
      vertical-align: middle;
      z-index: 1000;
      white-space: nowrap;
      line-height: 1.2;
    `;

    // Insert badge at the end of the nickname_profile container
    nicknameContainer.appendChild(badge);
      "[MYM] Badge added to chat header for",
      username,
      ":",
      total.toFixed(2),
      "€"
    );
    */
  }

  async function pollOnce() {
    if (pollingInProgress) {
      return;
    }
    pollingInProgress = true;
    try {
      // If on chat page and discussions not yet injected, fetch myms page first
      if (isChatPage && !discussionsInjected) {
        const mymsRes = await fetchMymsPage();
        if (mymsRes.html) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(mymsRes.html, "text/html");
          injectDiscussionsList(doc);
        } else {
        }
      }

      const res = await fetchChatDirect();
      if (res.error) {
        return;
      }
      if (res.html) handleFetchedHtml(res.html);
    } catch (err) {
      // silent fail
    } finally {
      pollingInProgress = false;
    }
  }

  function startPolling() {
    if (pollHandle) return; // already started
    
    // Vérifier si la page est visible avant de commencer le polling
    if (document.hidden) return;
    
    scanExisting();

    // Scan existing lists for badges on initial load
    scanExistingListsForBadges();

    // On /app/myms and followers pages, content is loaded via AJAX, so scan multiple times
    // Optimisé: réduire de 3 scans à 2 scans
    if (isMymsPage || isFollowersPage) {
      setTimeout(() => {
        scanExistingListsForBadges();
      }, 2000);
      setTimeout(() => {
        scanExistingListsForBadges();
      }, 5000);
    }

    // Add badge to chat header if on chat page
    if (isChatPage && badgesEnabled) {
      addBadgeToChatHeader();
    }

    pollOnce();
    pollHandle = setInterval(pollOnce, POLL_INTERVAL_MS);

    const container =
      isMymsPage || isFollowersPage
        ? document.querySelector(".content-body") ||
          document.querySelector(".page.my-myms") ||
          document.body
        : document.querySelector(CONTAINER_SELECTOR) || document.body;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((n) => {
            if (!(n instanceof Element)) return;
            if (isMymsPage || isFollowersPage) {
              // detect added list rows
              if (n.matches && n.matches(LIST_ROW_SELECTOR)) {
                const a = n.querySelector("a[data-id]");
                const id = a && (a.getAttribute("data-id") || a.dataset.id);
                if (id) knownListIds.add(id.toString());
                // Add badge to the new row
                processRowForBadge(n);
              } else {
                n.querySelectorAll &&
                  n.querySelectorAll(LIST_ROW_SELECTOR).forEach((el) => {
                    const a = el.querySelector("a[data-id]");
                    const id = a && (a.getAttribute("data-id") || a.dataset.id);
                    if (id) knownListIds.add(id.toString());
                    // Add badge to the new row
                    processRowForBadge(el);
                  });
              }

              // Also detect .user-card (followers page)
              if (n.matches && n.matches(".user-card")) {
                processCardForBadge(n);
              } else {
                n.querySelectorAll &&
                  n.querySelectorAll(".user-card").forEach((el) => {
                    processCardForBadge(el);
                  });
              }
            } else {
              if (n.matches && n.matches(MESSAGE_SELECTOR)) {
                const id =
                  n.getAttribute("data-chat-message-id") ||
                  n.dataset.chatMessageId;
                if (id) knownChatIds.add(id.toString());
              } else {
                n.querySelectorAll &&
                  n.querySelectorAll(MESSAGE_SELECTOR).forEach((el) => {
                    const id =
                      el.getAttribute("data-chat-message-id") ||
                      el.dataset.chatMessageId;
                    if (id) knownChatIds.add(id.toString());
                  });
              }
            }
          });
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    // Observer for chat header changes (when switching between conversations)
    if (isChatPage && badgesEnabled) {
      const mainContainer = document.querySelector("main") || document.body;
      const headerObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          // Check if nickname_profile was added or modified
          if (m.addedNodes && m.addedNodes.length) {
            m.addedNodes.forEach((n) => {
              if (!(n instanceof Element)) return;

              // Check if the added node contains or is a nickname_profile
              if (n.matches && n.matches(".nickname_profile")) {
                // Small delay to ensure DOM is ready
                setTimeout(() => {
                  addBadgeToChatHeader();
                  // 🆕 Mettre à jour la box d'information utilisateur
                  const currentUsername = getCurrentConversationUsername();
                  if (currentUsername) {
                    injectUserInfoBox(currentUsername);
                  }
                }, 500);
              } else if (n.querySelectorAll) {
                const profiles = n.querySelectorAll(".nickname_profile");
                if (profiles.length > 0) {
                  //   "[MYM] Nickname profile detected in header (nested)"
                  // );
                  setTimeout(() => {
                    addBadgeToChatHeader();
                    // 🆕 Mettre à jour la box d'information utilisateur
                    const currentUsername = getCurrentConversationUsername();
                    if (currentUsername) {
                      injectUserInfoBox(currentUsername);
                    }
                  }, 500);
                }
              }
            });
          }
        }
      });
      headerObserver.observe(mainContainer, { childList: true, subtree: true });
    }
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Remove broadcast buttons when features are disabled
    removeBroadcastButtons();
  }
  
  // 🧹 Cleanup global: event listeners et observers
  function cleanupAll() {
    // Stop polling
    stopPolling();
    
    // Stop subscription monitoring
    stopSubscriptionMonitoring();
    
    // Disconnect all observers
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
    
    // Remove event listeners
    if (globalClickHandler) {
      document.removeEventListener("click", globalClickHandler);
      globalClickHandler = null;
    }
    if (popstateHandler) {
      window.removeEventListener("popstate", popstateHandler);
      popstateHandler = null;
    }
    if (messageListener) {
      try {
        chrome.runtime.onMessage.removeListener(messageListener);
      } catch (e) {
        // Extension context may be invalidated
      }
      messageListener = null;
    }
    
    // Abort any pending fetches
    if (userInfoBoxFetchController) {
      userInfoBoxFetchController.abort();
      userInfoBoxFetchController = null;
    }
    if (badgeFetchController) {
      badgeFetchController.abort();
      badgeFetchController = null;
    }
    
    // Clear caches
    userInfoCache.clear();
    totalSpentFetched.clear();
  }

  // Storage reading/watching
  async function readFeatureFlags() {
    return new Promise((resolve) => {
      if (
        typeof window.chrome !== "undefined" &&
        window.chrome.storage &&
        window.chrome.storage.local &&
        window.chrome.storage.local.get
      ) {
        try {
          window.chrome.storage.local.get(
            {
              access_token: null,
              firebaseToken: null,
              mym_badges_enabled: false,
              mym_stats_enabled: false,
              mym_emoji_enabled: false,
              mym_notes_enabled: false,
              mym_broadcast_enabled: false,
            },
            async (items) => {
              const last =
                window.chrome.runtime && window.chrome.runtime.lastError;
              if (last) {
                resolve({
                  badges: false,
                  stats: false,
                  emoji: false,
                  notes: false,
                  broadcast: false,
                });
                return;
              }
              // Only enable features if token exists (Firebase ou Google)
              const hasToken = !!(items.access_token || items.firebaseToken);
              if (!hasToken) {
                resolve({
                  badges: false,
                  stats: false,
                  emoji: false,
                  notes: false,
                  broadcast: false,
                });
                return;
              }

              // 🔒 Vérifier que l'abonnement est actif
              const isSubscriptionActive = await verifySubscriptionStatus(
                items.firebaseToken || items.access_token
              );
              if (!isSubscriptionActive) {
                resolve({
                  badges: false,
                  stats: false,
                  emoji: false,
                  notes: false,
                  broadcast: false,
                });
                return;
              }

              const flags = {
                badges: Boolean(items.mym_badges_enabled),
                stats: Boolean(items.mym_stats_enabled),
                emoji: Boolean(items.mym_emoji_enabled),
                notes: Boolean(items.mym_notes_enabled),
                broadcast: Boolean(items.mym_broadcast_enabled),
              };
              resolve(flags);
            }
          );
        } catch (err) {
          resolve({
            badges: true,
            stats: true,
            emoji: true,
            notes: true,
            broadcast: true,
          });
        }
      } else {
        resolve({
          badges: true,
          stats: true,
          emoji: true,
          notes: true,
          broadcast: true,
        });
      }
    });
  }

  function readEnabledFlag(defaultVal = false) {
    return new Promise((resolve) => {
      if (
        typeof window.chrome !== "undefined" &&
        window.chrome.storage &&
        window.chrome.storage.local &&
        window.chrome.storage.local.get
      ) {
        try {
          window.chrome.storage.local.get(
            {
              access_token: null,
              firebaseToken: null,
              mym_live_enabled: defaultVal,
            },
            async (items) => {
              const last =
                window.chrome.runtime && window.chrome.runtime.lastError;
              if (last) {
                resolve(false);
                return;
              }
              // Only enable if token exists (Firebase ou Google)
              const hasToken = !!(items.access_token || items.firebaseToken);
              if (!hasToken) {
                console.log("🔒 Pas de token - fonctionnalités désactivées");
                resolve(false);
                return;
              }

              // 🔒 Vérifier que l'abonnement est actif
              const isSubscriptionActive = await verifySubscriptionStatus(
                items.firebaseToken || items.access_token
              );
              if (!isSubscriptionActive) {
                console.log(
                  "🔒 Abonnement inactif - fonctionnalités désactivées"
                );
                resolve(false);
                return;
              }

              const enabled = Boolean(items.mym_live_enabled);
              resolve(enabled);
            }
          );
        } catch (err) {
          resolve(defaultVal);
        }
      } else {
        resolve(defaultVal);
      }
    });
  }

  function watchStorageChanges() {
    if (
      typeof window.chrome !== "undefined" &&
      window.chrome.storage &&
      window.chrome.storage.onChanged
    ) {
      window.chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        // 🔑 Si le token change (connexion/déconnexion), recharger les flags
        if (changes.access_token) {
          // Vider le cache utilisateur lors du changement de token
          userInfoCache.clear();
          totalSpentFetched.clear();
          
          readFeatureFlags().then((flags) => {
            badgesEnabled = flags.badges;
            statsEnabled = flags.stats;
            emojiEnabled = flags.emoji;
            notesEnabled = flags.notes;

            // Activer les features si elles sont enabled
            if (flags.badges) {
              scanExistingListsForBadges();
            }
            if (flags.stats && isChatPage) {
              const currentUsername = getCurrentConversationUsername();
              if (currentUsername) {
                injectUserInfoBox(currentUsername);
              }
            }
            if (flags.emoji) {
              setupEmojiButtonsForInputs();
            }
            if (flags.notes && isChatPage) {
              createNotesButton();
            }
          });

          // Aussi recharger l'état enabled
          readEnabledFlag(false).then((enabled) => {
            if (enabled) startPolling();
            else stopPolling();
          });
        }

        if (changes.mym_live_enabled) {
          const oldValue = changes.mym_live_enabled.oldValue;
          const newValue = changes.mym_live_enabled.newValue;

          // Si passage de activé à désactivé (révocation), recharger la page
          if (oldValue === true && newValue === false) {
            console.log(
              "🚫 Licence révoquée - rechargement de la page pour nettoyer les fonctionnalités"
            );
            stopPolling();
            setTimeout(() => {
              window.location.reload();
            }, 500);
            return;
          }

          if (newValue) startPolling();
          else stopPolling();
        }
        if (changes.mym_badges_enabled) {
          badgesEnabled = Boolean(changes.mym_badges_enabled.newValue);
          if (badgesEnabled) {
            scanExistingListsForBadges();
            if (isChatPage) {
              addBadgeToChatHeader();
            }
          } else {
            // Remove existing badges (both in lists and chat header)
            document
              .querySelectorAll(".mym-total-spent-badge")
              .forEach((b) => b.remove());
            document
              .querySelectorAll(".mym-total-spent-badge-header")
              .forEach((b) => b.remove());
          }
        }
        if (changes.mym_stats_enabled) {
          statsEnabled = Boolean(changes.mym_stats_enabled.newValue);
          if (!statsEnabled) {
            // Remove stats box
            const box = document.getElementById("mym-user-info-box");
            if (box) box.remove();
          } else if (isChatPage) {
            // Refresh the stats box
            const currentUsername = getCurrentConversationUsername();
            if (currentUsername) {
              injectUserInfoBox(currentUsername);
            }
          }
        }
        if (changes.mym_emoji_enabled) {
          emojiEnabled = Boolean(changes.mym_emoji_enabled.newValue);
          if (!emojiEnabled) {
            // Remove emoji buttons
            document
              .querySelectorAll(".mym-emoji-button")
              .forEach((b) => b.remove());
            hideEmojiPicker();
          } else {
            setupEmojiButtonsForInputs();
          }
        }
        if (changes.mym_notes_enabled) {
          notesEnabled = Boolean(changes.mym_notes_enabled.newValue);
          if (!notesEnabled) {
            // Remove notes button and panel
            const btn = document.getElementById("mym-notes-button");
            const panel = document.getElementById("mym-notes-panel");
            if (btn) btn.remove();
            if (panel) panel.remove();
          } else if (isChatPage) {
            createNotesButton();
          }
        }
      });
    }
  }

  // Emoji Picker Functions
  function createEmojiPicker() {
    const picker = document.createElement("div");
    picker.id = "mym-emoji-picker";
    picker.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 520px;
      max-height: 300px;
      display: none;
      flex-direction: column;
      right: 0;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
    `;

    // Frequently used section (FIXED at top)
    const frequentSection = document.createElement("div");
    frequentSection.id = "mym-frequent-emojis";
    frequentSection.style.cssText = `
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
      padding: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
      flex-shrink: 0;
      background: white;
    `;
    picker.appendChild(frequentSection);

    // Scrollable container for all emojis
    const scrollContainer = document.createElement("div");
    scrollContainer.style.cssText = `
      overflow-y: auto;
      padding: 10px;
      flex: 1;
      min-height: 0;
    `;

    // All emojis section
    const allSection = document.createElement("div");
    allSection.id = "mym-all-emojis";
    allSection.style.cssText = `
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
    `;

    EMOJI_LIST.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.textContent = emoji;
      btn.style.cssText = `
        font-size: 24px;
        border: none;
        background: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.2s;
      `;
      btn.onmouseenter = () => (btn.style.background = "#f0f0f0");
      btn.onmouseleave = () => (btn.style.background = "none");
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertEmojiIntoInput(emoji);
      };
      allSection.appendChild(btn);
    });

    scrollContainer.appendChild(allSection);
    picker.appendChild(scrollContainer);
    document.body.appendChild(picker);

    // Load frequent emojis
    updateFrequentEmojis();

    return picker;
  }

  function createEmojiButton() {
    const btn = document.createElement("button");
    btn.className = "mym-emoji-button";
    btn.textContent = "😀";
    btn.title = "Ajouter un émoji";
    btn.style.cssText = `
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 20px;
      border: none;
      background: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.2s;
      z-index: 100;
    `;
    btn.onmouseenter = () => (btn.style.background = "#f0f0f0");
    btn.onmouseleave = () => (btn.style.background = "none");
    return btn;
  }

  function insertEmojiIntoInput(emoji) {
    if (!currentInput) return;

    const start = currentInput.selectionStart || 0;
    const end = currentInput.selectionEnd || 0;
    const text = currentInput.value;

    currentInput.value = text.substring(0, start) + emoji + text.substring(end);
    currentInput.selectionStart = currentInput.selectionEnd =
      start + emoji.length;
    currentInput.focus();

    // Trigger input event for any listeners
    currentInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Track emoji usage
    trackEmojiUsage(emoji);

    hideEmojiPicker();
  }

  function showEmojiPicker(input, button) {
    const picker =
      document.getElementById("mym-emoji-picker") || createEmojiPicker();
    currentInput = input;

    const rect = button.getBoundingClientRect();
    picker.style.display = "flex";

    // Position ABOVE the button and aligned to the right edge
    picker.style.bottom = window.innerHeight - rect.top + 5 + "px";
    picker.style.top = "auto";
    picker.style.right = window.innerWidth - rect.right + "px";
    picker.style.left = "auto";

    emojiPickerVisible = true;
  }

  function hideEmojiPicker() {
    const picker = document.getElementById("mym-emoji-picker");
    if (picker) {
      picker.style.display = "none";
    }
    emojiPickerVisible = false;
  }

  // Track emoji usage and save to storage
  async function trackEmojiUsage(emoji) {
    try {
      // Load current usage stats
      const result = await new Promise((resolve) => {
        chrome.storage.sync.get(["emojiUsageCount"], resolve);
      });

      emojiUsageCount = result.emojiUsageCount || {};
      emojiUsageCount[emoji] = (emojiUsageCount[emoji] || 0) + 1;

      // Save back to storage
      await new Promise((resolve) => {
        chrome.storage.sync.set({ emojiUsageCount }, resolve);
      });

      // Update frequent emojis display
      updateFrequentEmojis();
    } catch (err) {
      console.error("[MYM] Error tracking emoji usage:", err);
    }
  }

  // Update the frequent emojis section
  async function updateFrequentEmojis() {
    try {
      // Load usage stats
      const result = await new Promise((resolve) => {
        chrome.storage.sync.get(["emojiUsageCount"], resolve);
      });

      emojiUsageCount = result.emojiUsageCount || {};

      // Get top 8 most used emojis
      const sortedEmojis = Object.entries(emojiUsageCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([emoji]) => emoji);

      const frequentSection = document.getElementById("mym-frequent-emojis");
      if (!frequentSection) return;

      // Clear and rebuild frequent section
      frequentSection.innerHTML = "";

      if (sortedEmojis.length === 0) {
        frequentSection.style.display = "none";
        return;
      }

      frequentSection.style.display = "grid";

      sortedEmojis.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.textContent = emoji;
        btn.style.cssText = `
          font-size: 24px;
          border: none;
          background: #f8f8f8;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: background 0.2s;
        `;
        btn.onmouseenter = () => (btn.style.background = "#e0e0e0");
        btn.onmouseleave = () => (btn.style.background = "#f8f8f8");
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          insertEmojiIntoInput(emoji);
        };
        frequentSection.appendChild(btn);
      });
    } catch (err) {
      console.error("[MYM] Error updating frequent emojis:", err);
    }
  }

  function setupEmojiButtonsForInputs() {
    if (!emojiEnabled) return;
    // Find all text inputs and textareas (but skip notes textarea)
    const inputs = document.querySelectorAll('input[type="text"], textarea');

    inputs.forEach((input) => {
      // Skip notes textarea
      if (input.id === "mym-notes-textarea") return;

      // Skip customPrice input
      if (input.id === "customPrice") return;

      // Skip if already has emoji button
      if (input.parentElement?.querySelector(".mym-emoji-button")) return;

      // Make parent position relative if it's not already
      const parent = input.parentElement;
      if (parent && getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }

      const emojiBtn = createEmojiButton();
      emojiBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (emojiPickerVisible) {
          hideEmojiPicker();
        } else {
          showEmojiPicker(input, emojiBtn);
        }
      };

      parent?.appendChild(emojiBtn);
    });
  }

  // Close picker when clicking outside
  if (!globalClickHandler) {
    globalClickHandler = (e) => {
      if (
        emojiPickerVisible &&
        !e.target.closest("#mym-emoji-picker") &&
        !e.target.closest(".mym-emoji-button")
      ) {
        hideEmojiPicker();
      }
    };
    document.addEventListener("click", globalClickHandler);
  }

  // Ctrl+Enter to send message feature
  function setupCtrlEnterShortcut() {
    const chatInputs = document.querySelectorAll(".chat-input__input textarea");

    chatInputs.forEach((textarea) => {
      // Skip if already setup
      if (textarea.hasAttribute("data-mym-ctrlenter-setup")) return;
      textarea.setAttribute("data-mym-ctrlenter-setup", "true");

      // Add tooltip on hover
      const parentDiv = textarea.closest(".input__field");
      if (parentDiv && !parentDiv.hasAttribute("data-mym-tooltip-added")) {
        parentDiv.setAttribute("data-mym-tooltip-added", "true");
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
            if (sendButton) {
              sendButton.click();
            }
          }
        }
      });
    });
  }

  // Broadcast message feature
  function setupBroadcastButton() {
    // Vérifier si la fonctionnalité broadcast est activée
    chrome.storage.local.get(
      ["mym_broadcast_enabled", "mym_live_enabled"],
      (items) => {
        const broadcastEnabled = items.mym_broadcast_enabled;
        const globalEnabled = items.mym_live_enabled;

        if (!broadcastEnabled || !globalEnabled) {
          removeBroadcastButtons();
          return;
        }

        const chatInputs = document.querySelectorAll(".chat-input--creators");

        chatInputs.forEach((chatInput) => {
          // Skip if already setup
          if (chatInput.hasAttribute("data-mym-broadcast-setup")) {
            return;
          }
          chatInput.setAttribute("data-mym-broadcast-setup", "true");

          // Find the send button to clone its style
          const sendButton = chatInput.querySelector(".chat-input__send");
          if (!sendButton) {
            return;
          }

          // Create broadcast button
          const broadcastButton = document.createElement("button");
          broadcastButton.type = "button";
          broadcastButton.className =
            "button button--icon button--primary chat-input__broadcast";
          broadcastButton.title = "Envoyer à tous les contacts";
          broadcastButton.style.cssText = `
          margin-left: 8px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        `;

          broadcastButton.innerHTML = `
          <span class="button__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M10 3C6.13401 3 3 6.13401 3 10C3 13.866 6.13401 17 10 17C13.866 17 17 13.866 17 10C17 6.13401 13.866 3 10 3ZM10 5C7.23858 5 5 7.23858 5 10C5 12.7614 7.23858 15 10 15C12.7614 15 15 12.7614 15 10C15 7.23858 12.7614 5 10 5ZM10 7C8.34315 7 7 8.34315 7 10C7 11.6569 8.34315 13 10 13C11.6569 13 13 11.6569 13 10C13 8.34315 11.6569 7 10 7Z" fill="white"/>
              <circle cx="10" cy="10" r="1.5" fill="white"/>
            </svg>
          </span>
        `;

          // Add click handler
          broadcastButton.addEventListener("click", async () => {
            const textarea = chatInput.querySelector("textarea");
            if (!textarea) return;

            const message = textarea.value.trim();
            if (!message) {
              alert("Veuillez entrer un message à diffuser");
              return;
            }

            if (
              !confirm(
                `Êtes-vous sûr de vouloir envoyer ce message à tous vos contacts ?\n\n"${message}"`
              )
            ) {
              return;
            }

            // Disable button during broadcast
            broadcastButton.disabled = true;
            broadcastButton.style.opacity = "0.5";

            try {
              await broadcastMessage(message);
              textarea.value = "";
              alert("Message diffusé avec succès à tous vos contacts !");
            } catch (error) {
              console.error("Erreur lors de la diffusion:", error);
              alert("Erreur lors de la diffusion du message");
            } finally {
              broadcastButton.disabled = false;
              broadcastButton.style.opacity = "1";
            }
          });

          // Insert button after send button
          sendButton.parentNode.insertBefore(
            broadcastButton,
            sendButton.nextSibling
          );
        });
      }
    ); // Close chrome.storage.local.get callback
  }

  // Remove broadcast buttons when features are disabled
  function removeBroadcastButtons() {
    const broadcastButtons = document.querySelectorAll(
      ".chat-input__broadcast"
    );
    broadcastButtons.forEach((button) => button.remove());

    // Remove setup markers so buttons can be recreated later if needed
    const chatInputs = document.querySelectorAll(".chat-input--creators");
    chatInputs.forEach((chatInput) => {
      chatInput.removeAttribute("data-mym-broadcast-setup");
    });
  }

  async function broadcastMessage(message) {
    // Get all contact IDs from the discussions list
    const contactIds = await getAllContactIds();

    if (contactIds.length === 0) {
      throw new Error("Aucun contact trouvé");
    }

    let successCount = 0;
    let failCount = 0;

    // Send message to each contact
    for (const contactId of contactIds) {
      try {
        const response = await fetch(
          `https://creators.mym.fans/app/ajax/chat/send_message_to_fan/fan/${contactId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: message,
              type: "message",
            }),
          }
        );

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          console.error(
            `Échec d'envoi au contact ${contactId}:`,
            response.status
          );
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        failCount++;
        console.error(`Erreur lors de l'envoi au contact ${contactId}:`, error);
      }
    }

    console.log(
      `Diffusion terminée: ${successCount} réussis, ${failCount} échoués`
    );
  }

  async function getAllContactIds() {
    // Try to get from injected discussions list first
    const injectedRows = document.querySelectorAll(
      '[data-mym-injected="true"] .list__row a[href*="/app/chat/"]'
    );

    if (injectedRows.length > 0) {
      const ids = Array.from(injectedRows)
        .map((link) => {
          const match = link.href.match(/\/app\/chat\/(\d+)/);
          return match ? match[1] : null;
        })
        .filter((id) => id !== null);

      return ids;
    }

    // Fallback: fetch from /app/myms page
    try {
      const response = await fetch("https://creators.mym.fans/app/myms");
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const links = doc.querySelectorAll('a[href*="/app/chat/"]');
      const ids = Array.from(links)
        .map((link) => {
          const match = link.href.match(/\/app\/chat\/(\d+)/);
          return match ? match[1] : null;
        })
        .filter((id) => id !== null);

      // Remove duplicates
      return [...new Set(ids)];
    } catch (error) {
      console.error("Erreur lors de la récupération des contacts:", error);
      return [];
    }
  }

  // User Notes Feature
  let currentChatIdForNotes = null;

  function createNotesPanel() {
    if (document.getElementById("mym-notes-panel")) return;

    // Vérifier si l'extension est encore valide
    try {
      if (!chrome.runtime?.id) {
        alert("⚠️ Extension rechargée. Veuillez rafraîchir la page pour utiliser les notes.");
        return;
      }
      // Test chrome.storage access
      chrome.storage.sync.get(["test"], () => {});
    } catch (error) {
      console.warn("[MYM] Extension context invalidated:", error);
      alert("⚠️ Extension rechargée. Veuillez rafraîchir la page pour utiliser les notes.");
      return;
    }

    // Store current chat ID
    currentChatIdForNotes = getChatId();

    const panel = document.createElement("div");
    panel.id = "mym-notes-panel";
    panel.style.cssText = `
      position: fixed;
      right: 20px;
      top: 80px;
      width: 320px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 9999;
      padding: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    `;

    const user = getUserIdentifier();
    const title = document.createElement("h3");
    title.textContent = "Notes pour: " + user.username;
    title.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: white;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: white;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
    `;
    closeBtn.onmouseenter = () =>
      (closeBtn.style.background = "rgba(255, 255, 255, 0.2)");
    closeBtn.onmouseleave = () =>
      (closeBtn.style.background = "rgba(255, 255, 255, 0.1)");
    closeBtn.onclick = () => panel.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    const textarea = document.createElement("textarea");
    textarea.id = "mym-notes-textarea";
    textarea.placeholder = "Écrivez vos notes ici...";
    textarea.style.cssText = `
      width: 100%;
      min-height: 200px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
      transition: all 0.2s;
      background: rgba(255, 255, 255, 0.95);
      color: #333;
    `;
    textarea.onfocus = () => {
      textarea.style.borderColor = "rgba(255, 255, 255, 0.4)";
      textarea.style.background = "white";
    };
    textarea.onblur = () => {
      textarea.style.borderColor = "rgba(255, 255, 255, 0.2)";
      textarea.style.background = "rgba(255, 255, 255, 0.95)";
    };

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Enregistrer";
    saveBtn.style.cssText = `
      margin-top: 12px;
      width: 100%;
      padding: 10px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    saveBtn.onmouseenter = () => {
      saveBtn.style.background = "rgba(255, 255, 255, 0.3)";
      saveBtn.style.transform = "translateY(-1px)";
    };
    saveBtn.onmouseleave = () => {
      saveBtn.style.background = "rgba(255, 255, 255, 0.2)";
      saveBtn.style.transform = "translateY(0)";
    };
    saveBtn.onclick = () => saveUserNotes();

    // Templates section
    const templatesContainer = document.createElement("div");
    templatesContainer.style.cssText = `
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    `;

    const templatesTitle = document.createElement("div");
    templatesTitle.textContent = "📋 Templates rapides";
    templatesTitle.style.cssText = `
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: rgba(255, 255, 255, 0.9);
    `;

    const templatesGrid = document.createElement("div");
    templatesGrid.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    `;

    // Default templates
    const defaultTemplates = [
      "✅ Validé",
      "⏰ En attente",
      "📸 Photos demandées",
      "💰 Paiement reçu",
      "📝 À recontacter",
      "⭐ VIP",
      "🎁 Offre spéciale envoyée\nMerci pour votre intérêt",
      "❌ Pas intéressé",
    ];

    // Load custom templates from storage
    if (!chrome.runtime?.id) {
      console.warn('[MYM] Extension context invalidated, using default templates');
      // Use default templates without storage
      const templates = defaultTemplates;
      templatesGrid.innerHTML = '';
      
      templates.forEach((template, index) => {
        const btn = document.createElement("button");
        const label = template.split('\n')[0].substring(0, 20) + (template.length > 20 ? '...' : '');
        btn.textContent = label;
        btn.title = template;
        btn.style.cssText = `
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `;
        btn.onmouseenter = () => {
          btn.style.background = "rgba(255, 255, 255, 0.25)";
          btn.style.transform = "translateY(-1px)";
        };
        btn.onmouseleave = () => {
          btn.style.background = "rgba(255, 255, 255, 0.15)";
          btn.style.transform = "translateY(0)";
        };
        btn.onclick = () => {
          const chatTextarea = document.querySelector('textarea.input__input--textarea');
          if (chatTextarea) {
            const currentText = chatTextarea.value;
            const newText = currentText ? currentText + '\n' + template : template;
            chatTextarea.value = newText;
            const event = new Event('input', { bubbles: true });
            chatTextarea.dispatchEvent(event);
            chatTextarea.focus();
          } else {
            alert('⚠️ Textarea de chat non trouvé. Assurez-vous d\'être dans une conversation.');
          }
        };
        templatesGrid.appendChild(btn);
      });
      return;
    }

    try {
      chrome.storage.sync.get(['mym_note_templates'], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[MYM] Error loading templates:', chrome.runtime.lastError);
          return;
        }
        const templates = result.mym_note_templates || defaultTemplates;
      
      templatesGrid.innerHTML = ''; // Clear existing
      
      templates.forEach((template, index) => {
        const btn = document.createElement("button");
        // Show first line or first 20 chars as button label
        const label = template.split('\n')[0].substring(0, 20) + (template.length > 20 ? '...' : '');
        btn.textContent = label;
        btn.title = template; // Show full template on hover
        btn.style.cssText = `
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `;
        btn.onmouseenter = () => {
          btn.style.background = "rgba(255, 255, 255, 0.25)";
          btn.style.transform = "translateY(-1px)";
        };
        btn.onmouseleave = () => {
          btn.style.background = "rgba(255, 255, 255, 0.15)";
          btn.style.transform = "translateY(0)";
        };
        btn.onclick = () => {
          // Trouver le textarea de chat MYM
          const chatTextarea = document.querySelector('textarea.input__input--textarea');
          if (chatTextarea) {
            const currentText = chatTextarea.value;
            const newText = currentText ? currentText + '\n' + template : template;
            chatTextarea.value = newText;
            
            // Trigger input event pour que MYM détecte le changement
            const event = new Event('input', { bubbles: true });
            chatTextarea.dispatchEvent(event);
            
            // Focus sur le textarea
            chatTextarea.focus();
          } else {
            alert('⚠️ Textarea de chat non trouvé. Assurez-vous d\'être dans une conversation.');
          }
        };
        
        templatesGrid.appendChild(btn);
      });
    });
    } catch (error) {
      console.error('[MYM] Error loading templates from storage:', error);
    }

    const manageTemplatesBtn = document.createElement("button");
    manageTemplatesBtn.textContent = "⚙️ Gérer les templates";
    manageTemplatesBtn.style.cssText = `
      margin-top: 8px;
      width: 100%;
      padding: 6px;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    manageTemplatesBtn.onmouseenter = () => {
      manageTemplatesBtn.style.background = "rgba(255, 255, 255, 0.15)";
    };
    manageTemplatesBtn.onmouseleave = () => {
      manageTemplatesBtn.style.background = "rgba(255, 255, 255, 0.1)";
    };
    manageTemplatesBtn.onclick = () => openTemplateManager(templatesGrid);

    templatesContainer.appendChild(templatesTitle);
    templatesContainer.appendChild(templatesGrid);
    templatesContainer.appendChild(manageTemplatesBtn);

    panel.appendChild(header);
    panel.appendChild(textarea);
    panel.appendChild(saveBtn);
    panel.appendChild(templatesContainer);

    document.body.appendChild(panel);

    // Load existing notes
    loadUserNotes();

    // Auto-save on typing (debounced)
    let saveTimeout;
    textarea.addEventListener("input", () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => saveUserNotes(true), 2000);
    });
  }

  function getUserIdentifier() {
    // Get current chat ID or user identifier
    const chatId = getChatId();
    if (!chatId) return null;

    // Try to get username from page - use multiple selectors
    let username = null;

    // Try to find the full username in main content (chat header)
    const selectors = [
      "main .nickname_profile a.js-nickname-placeholder",
      "main .nickname_profile .js-nickname-placeholder",
      ".content-search-bar .nickname_profile a.js-nickname-placeholder",
      ".content-search-bar .nickname_profile .js-nickname-placeholder",
      ".nickname_profile a.js-nickname-placeholder",
      ".nickname_profile .js-nickname-placeholder",
      ".chat-header .js-nickname-placeholder",
      "span.js-nickname-placeholder",
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent.trim();
        // Only accept if it's more than 1 character (ignore avatar placeholders like "D")
        if (text && text.length > 1) {
          username = text;
          //   "[MYM] Found username for notes:",
          //   username,
          //   "using selector:",
          //   selector
          // );
          break;
        }
      }
      if (username) break;
    }

    return {
      chatId: chatId,
      username: username || `user_${chatId}`,
    };
  }

  function getNotesStorageKey() {
    const user = getUserIdentifier();
    if (!user) return null;
    return `mym_notes_${user.chatId}`;
  }

  function loadUserNotes() {
    const key = getNotesStorageKey();
    if (!key) return;

    // Vérifier si l'extension est encore valide avant d'accéder au storage
    if (!chrome.runtime?.id) {
      console.warn("[MYM] Extension context invalidated, cannot load notes");
      const textarea = document.getElementById("mym-notes-textarea");
      if (textarea) {
        textarea.placeholder = "⚠️ Extension rechargée. Rafraîchissez la page.";
        textarea.disabled = true;
      }
      return;
    }

    // Use chrome.storage.sync to sync notes across devices and persist after reinstall
    try {
      chrome.storage.sync.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.error("[MYM] Error loading notes:", chrome.runtime.lastError);
          const textarea = document.getElementById("mym-notes-textarea");
          if (textarea) {
            textarea.placeholder =
              "⚠️ Erreur de chargement. Rafraîchissez la page.";
            textarea.disabled = true;
          }
          return;
        }

        const textarea = document.getElementById("mym-notes-textarea");
        if (textarea && result[key]) {
          textarea.value = result[key].notes || "";
          updateLastSavedTime(result[key].lastSaved);
        }
      });
    } catch (error) {
      console.error(
        "[MYM] Extension context invalidated while loading notes:",
        error
      );
      const textarea = document.getElementById("mym-notes-textarea");
      if (textarea) {
        textarea.placeholder = "⚠️ Extension rechargée. Rafraîchissez la page.";
        textarea.disabled = true;
      }
    }
  }

  function openTemplateManager(templatesGrid) {
    // Create modal for managing templates
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 24px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      color: white;
    `;

    const title = document.createElement("h3");
    title.textContent = "⚙️ Gérer les templates";
    title.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
    `;

    const description = document.createElement("p");
    description.textContent = "Ajoutez ou modifiez vos templates ci-dessous. Utilisez le bouton + pour ajouter un nouveau template.";
    description.style.cssText = `
      margin: 0 0 12px 0;
      font-size: 13px;
      opacity: 0.9;
    `;

    const templatesListContainer = document.createElement("div");
    templatesListContainer.style.cssText = `
      max-height: 400px;
      overflow-y: auto;
      margin-bottom: 12px;
    `;

    const addTemplateBtn = document.createElement("button");
    addTemplateBtn.textContent = "+ Ajouter un template";
    addTemplateBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    `;
    addTemplateBtn.onmouseenter = () => addTemplateBtn.style.background = "rgba(255, 255, 255, 0.3)";
    addTemplateBtn.onmouseleave = () => addTemplateBtn.style.background = "rgba(255, 255, 255, 0.2)";

    function createTemplateInput(text = '', index = 0) {
      const templateItem = document.createElement("div");
      templateItem.style.cssText = `
        margin-bottom: 12px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        position: relative;
      `;

      const templateTextarea = document.createElement("textarea");
      templateTextarea.value = text;
      templateTextarea.placeholder = "Entrez votre template (multi-lignes autorisées)";
      templateTextarea.style.cssText = `
        width: 100%;
        min-height: 60px;
        padding: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        font-size: 13px;
        font-family: system-ui, -apple-system, sans-serif;
        resize: vertical;
        box-sizing: border-box;
        outline: none;
        background: rgba(255, 255, 255, 0.95);
        color: #333;
        margin-bottom: 8px;
      `;

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️ Supprimer";
      deleteBtn.style.cssText = `
        padding: 6px 12px;
        background: rgba(220, 38, 38, 0.8);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
      `;
      deleteBtn.onmouseenter = () => deleteBtn.style.background = "rgba(220, 38, 38, 1)";
      deleteBtn.onmouseleave = () => deleteBtn.style.background = "rgba(220, 38, 38, 0.8)";
      deleteBtn.onclick = () => templateItem.remove();

      templateItem.appendChild(templateTextarea);
      templateItem.appendChild(deleteBtn);
      
      return templateItem;
    }

    // Load current templates
    if (!chrome.runtime?.id) {
      console.warn('[MYM] Extension context invalidated in template manager');
      alert('⚠️ Extension rechargée. Veuillez rafraîchir la page.');
      modal.remove();
      return;
    }

    try {
      chrome.storage.sync.get(['mym_note_templates'], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[MYM] Error loading templates:', chrome.runtime.lastError);
          return;
        }
        const defaultTemplates = [
          "✅ Validé",
          "⏰ En attente",
          "📸 Photos demandées",
          "💰 Paiement reçu",
          "📝 À recontacter",
          "⭐ VIP",
          "🎁 Offre spéciale envoyée\nMerci pour votre intérêt",
          "❌ Pas intéressé",
        ];
        const templates = result.mym_note_templates || defaultTemplates;
        
        templates.forEach((template, index) => {
          templatesListContainer.appendChild(createTemplateInput(template, index));
        });
      });
    } catch (error) {
      console.error('[MYM] Error in template manager storage access:', error);
    }

    addTemplateBtn.onclick = () => {
      const newInput = createTemplateInput('', templatesListContainer.children.length);
      templatesListContainer.appendChild(newInput);
      newInput.querySelector('textarea').focus();
    };

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 16px;
    `;

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "💾 Enregistrer";
    saveBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    saveBtn.onmouseenter = () => saveBtn.style.background = "rgba(255, 255, 255, 0.3)";
    saveBtn.onmouseleave = () => saveBtn.style.background = "rgba(255, 255, 255, 0.2)";
    saveBtn.onclick = () => {
      if (!chrome.runtime?.id) {
        alert('⚠️ Extension rechargée. Veuillez rafraîchir la page.');
        return;
      }

      // Collect all templates from textareas
      const templateInputs = templatesListContainer.querySelectorAll('textarea');
      const templates = Array.from(templateInputs)
        .map(ta => ta.value.trim())
        .filter(t => t.length > 0);
      
      try {
        chrome.storage.sync.set({ mym_note_templates: templates }, () => {
          if (chrome.runtime.lastError) {
            console.error('[MYM] Error saving templates:', chrome.runtime.lastError);
            alert('❌ Erreur lors de la sauvegarde des templates');
            return;
          }

          // Refresh templates grid
          chrome.storage.sync.get(['mym_note_templates'], (result) => {
            if (chrome.runtime.lastError) {
              console.error('[MYM] Error loading templates:', chrome.runtime.lastError);
              return;
            }
            const templates = result.mym_note_templates || [];
            templatesGrid.innerHTML = '';
          
          const noteTextarea = document.getElementById('mym-notes-textarea');
          
          templates.forEach((template) => {
            const btn = document.createElement("button");
            // Show first line or first 20 chars as button label
            const label = template.split('\n')[0].substring(0, 20) + (template.length > 20 ? '...' : '');
            btn.textContent = label;
            btn.title = template; // Show full template on hover
            btn.style.cssText = `
              padding: 6px 10px;
              background: rgba(255, 255, 255, 0.15);
              color: white;
              border: 1px solid rgba(255, 255, 255, 0.25);
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
              transition: all 0.2s;
              text-align: left;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            `;
            btn.onmouseenter = () => {
              btn.style.background = "rgba(255, 255, 255, 0.25)";
              btn.style.transform = "translateY(-1px)";
            };
            btn.onmouseleave = () => {
              btn.style.background = "rgba(255, 255, 255, 0.15)";
              btn.style.transform = "translateY(0)";
            };
            btn.onclick = () => {
              // Trouver le textarea de chat MYM
              const chatTextarea = document.querySelector('textarea.input__input--textarea');
              if (chatTextarea) {
                const currentText = chatTextarea.value;
                const newText = currentText ? currentText + '\n' + template : template;
                chatTextarea.value = newText;
                
                // Trigger input event pour que MYM détecte le changement
                const event = new Event('input', { bubbles: true });
                chatTextarea.dispatchEvent(event);
                
                // Focus sur le textarea
                chatTextarea.focus();
              }
            };
            
            templatesGrid.appendChild(btn);
          });
        });
        
        modal.remove();
      });
      } catch (error) {
        console.error('[MYM] Error saving templates:', error);
        alert('❌ Erreur lors de la sauvegarde des templates');
      }
    };

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Annuler";
    cancelBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    cancelBtn.onmouseenter = () => cancelBtn.style.background = "rgba(255, 255, 255, 0.15)";
    cancelBtn.onmouseleave = () => cancelBtn.style.background = "rgba(255, 255, 255, 0.1)";
    cancelBtn.onclick = () => modal.remove();

    buttonsContainer.appendChild(saveBtn);
    buttonsContainer.appendChild(cancelBtn);

    content.appendChild(title);
    content.appendChild(description);
    content.appendChild(addTemplateBtn);
    content.appendChild(templatesListContainer);
    content.appendChild(buttonsContainer);

    modal.appendChild(content);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
  }

  function saveUserNotes(isAutoSave = false) {
    const key = getNotesStorageKey();
    if (!key) return;

    const textarea = document.getElementById("mym-notes-textarea");
    if (!textarea) return;

    // Vérifier si l'extension est encore valide avant d'accéder au storage
    if (!chrome.runtime?.id) {
      console.warn("[MYM] Extension context invalidated, cannot save notes");
      if (!isAutoSave) {
        alert(
          "❌ Extension rechargée. Veuillez rafraîchir la page pour continuer à utiliser les notes."
        );
      }
      return;
    }

    const notes = textarea.value;
    const now = new Date().toISOString();

    // Use chrome.storage.sync to sync notes across devices and persist after reinstall
    try {
      chrome.storage.sync.set(
        {
          [key]: {
            notes: notes,
            lastSaved: now,
          },
        },
        () => {
          // Vérifier si l'extension a été invalidée
          if (chrome.runtime.lastError) {
            console.error(
              "[MYM] Error saving notes:",
              chrome.runtime.lastError
            );
            alert(
              "❌ Extension rechargée. Veuillez rafraîchir la page pour continuer à utiliser les notes."
            );
            return;
          }

          updateLastSavedTime(now);
          if (!isAutoSave) {
            showSaveConfirmation();
          }
        }
      );
    } catch (error) {
      console.error("[MYM] Extension context invalidated:", error);
      alert(
        "❌ Extension rechargée. Veuillez rafraîchir la page pour continuer à utiliser les notes."
      );
    }
  }

  function updateLastSavedTime(timestamp) {
    // Function disabled - last saved time display removed
    return;
  }

  function showSaveConfirmation() {
    const saveBtn = document.querySelector(
      "#mym-notes-panel button:last-of-type"
    );
    if (!saveBtn) return;

    const originalText = saveBtn.textContent;
    saveBtn.textContent = "✓";
    saveBtn.style.background = "#28a745";

    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = "rgba(255, 255, 255, 0.2)";
    }, 2000);
  }

  // Migrate notes from chrome.storage.local to chrome.storage.sync (one-time migration)
  async function migrateNotesToSync() {
    return new Promise((resolve) => {
      // Check if migration already done
      chrome.storage.sync.get(["mym_notes_migration_done"], (result) => {
        if (result.mym_notes_migration_done) {
          resolve();
          return;
        }

        // Get all data from local storage
        chrome.storage.local.get(null, (localData) => {
          // Filter only notes keys
          const notesData = {};
          let notesCount = 0;

          for (const key in localData) {
            if (key.startsWith("mym_notes_")) {
              notesData[key] = localData[key];
              notesCount++;
            }
          }

          if (notesCount === 0) {
            // Mark migration as done
            chrome.storage.sync.set(
              { mym_notes_migration_done: true },
              resolve
            );
            return;
          }

          // Add migration flag to the data
          notesData.mym_notes_migration_done = true;

          // Copy notes to sync storage
          chrome.storage.sync.set(notesData, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[MYM] Error migrating notes:",
                chrome.runtime.lastError
              );
              // If sync fails (quota exceeded), keep using local storage
              resolve();
              return;
            }

            //   `[MYM] Successfully migrated ${notesCount} notes to sync storage`
            // );

            // Optional: Remove old notes from local storage to free up space
            const keysToRemove = Object.keys(notesData).filter((k) =>
              k.startsWith("mym_notes_")
            );
            if (keysToRemove.length > 0) {
              chrome.storage.local.remove(keysToRemove, () => {
                resolve();
              });
            } else {
              resolve();
            }
          });
        });
      });
    });
  }

  function createNotesButton() {
    if (!notesEnabled) return;
    if (document.getElementById("mym-notes-button")) return;

    // Find the navigation desktop
    const nav = document.querySelector(".navigation.navigation--desktop");
    if (!nav) {
      setTimeout(createNotesButton, 500);
      return;
    }

    const button = document.createElement("button");
    button.id = "mym-notes-button";
    button.className = "navigation__button button-new button-new--primary";
    button.textContent = "📝 Notes";
    button.title = "Prendre des notes sur cet utilisateur";

    button.onclick = () => {
      const panel = document.getElementById("mym-notes-panel");
      if (panel) {
        panel.remove();
      } else {
        createNotesPanel();
      }
    };

    nav.appendChild(button);
  }

  // Remove sidebar footer
  function removeSidebarFooter() {
    const footerElement = document.querySelector(".sidebar__footer__list");
    if (footerElement) {
      footerElement.remove();
    }
  }

  // Initialize
  (async () => {
    // Migrate notes from chrome.storage.local to chrome.storage.sync (one-time migration)
    await migrateNotesToSync();

    const enabled = await readEnabledFlag(false);
    const flags = await readFeatureFlags();
    badgesEnabled = flags.badges;
    statsEnabled = flags.stats;
    emojiEnabled = flags.emoji;
    notesEnabled = flags.notes;

    watchStorageChanges();
    if (enabled) {
      startPolling();
    } else {
      stopPolling();
    }
    
    // 📱 Page Visibility API - Arrêter le polling quand l'onglet est inactif
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Page devenue invisible - arrêter le polling
        if (pollHandle) {
          clearInterval(pollHandle);
          pollHandle = null;
        }
      } else {
        // Page devenue visible - redémarrer le polling si activé
        readEnabledFlag(false).then((isEnabled) => {
          if (isEnabled && !pollHandle) {
            startPolling();
          }
        });
      }
    });

    // Remove sidebar footer immediately and watch for changes
    removeSidebarFooter();
    if (!footerObserver) {
      footerObserver = new MutationObserver(() => {
        removeSidebarFooter();
      });
      footerObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Setup emoji buttons for existing inputs
    setupEmojiButtonsForInputs();

    // Setup Ctrl+Enter shortcut for chat inputs
    setupCtrlEnterShortcut();

    // Setup broadcast button for chat inputs
    setupBroadcastButton();

    // Watch for new inputs being added to the page (avec throttling)
    let inputObserverTimeout;
    if (!inputObserver) {
      inputObserver = new MutationObserver(() => {
        if (inputObserverTimeout) return;
        inputObserverTimeout = setTimeout(() => {
          setupEmojiButtonsForInputs();
          setupCtrlEnterShortcut();
          setupBroadcastButton();
          inputObserverTimeout = null;
        }, 500); // Throttle à 500ms
      });
      inputObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Create notes button if on chat page
    if (isChatPage) {
      createNotesButton();

      // Watch for the notes button being removed and recreate it (avec throttling)
      let notesButtonTimeout;
      if (!notesButtonObserver) {
        notesButtonObserver = new MutationObserver(() => {
          if (notesButtonTimeout) return;
          notesButtonTimeout = setTimeout(() => {
            if (!document.getElementById("mym-notes-button") && notesEnabled) {
              createNotesButton();
            }
            notesButtonTimeout = null;
          }, 1000); // Throttle à 1s
        });
        notesButtonObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }

      // Watch for URL changes (navigation to different chats)
      let lastUrl = location.href;
      if (!urlObserver) {
        urlObserver = new MutationObserver(() => {
          const currentUrl = location.href;
          if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            const newChatId = getChatId();

            // If chat ID changed and notes panel is open, refresh it
            if (newChatId && newChatId !== currentChatIdForNotes) {
              const panel = document.getElementById("mym-notes-panel");
              if (panel) {
                panel.remove();
                createNotesPanel();
              }
              currentChatIdForNotes = newChatId;
            }
          }
        });
        urlObserver.observe(document.body, { childList: true, subtree: true });
      }

      // Also watch for popstate events (browser back/forward)
      if (!popstateHandler) {
        popstateHandler = () => {
          const newChatId = getChatId();
          if (newChatId && newChatId !== currentChatIdForNotes) {
            const panel = document.getElementById("mym-notes-panel");
            if (panel) {
              panel.remove();
              createNotesPanel();
            }
            currentChatIdForNotes = newChatId;
          }
        };
        window.addEventListener("popstate", popstateHandler);
      }
    }

    // Écouter les messages du background script
    if (!messageListener) {
      messageListener = (message, sender, sendResponse) => {
        if (message.action === "featuresEnabled") {
          console.log("🔓 Message reçu du background: fonctionnalités activées");
          // Recharger les flags et redémarrer le polling
          readFeatureFlags().then((flags) => {
            badgesEnabled = flags.badges;
            statsEnabled = flags.stats;
            emojiEnabled = flags.emoji;
            notesEnabled = flags.notes;
            console.log("🔧 Flags rechargés:", flags);

          readEnabledFlag(false).then((enabled) => {
            if (enabled) {
              console.log("✅ Redémarrage du polling");
              startPolling();
            }
          });
        });
      }

      if (message.action === "featuresDisabled") {
        // Désactiver tous les flags et arrêter le polling
        badgesEnabled = false;
        statsEnabled = false;
        emojiEnabled = false;
        notesEnabled = false;
        stopPolling();

        // Recharger la page pour nettoyer toutes les fonctionnalités injectées
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
  }
  
  // Cleanup lors du unload de la page
  window.addEventListener("beforeunload", () => {
    cleanupAll();
  });
  
  })();
})();

// Global error handler to prevent extension errors from breaking MYM
window.addEventListener(
  "error",
  function (e) {
    if (e.filename && e.filename.includes("chrome-extension://")) {
      console.error("⚠️ MYM Extension Error (non-fatal):", e.message);
      e.stopPropagation();
      return true; // Prevent error from propagating
    }
  },
  true
);
