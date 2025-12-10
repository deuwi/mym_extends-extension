// core.js - Fonctions utilitaires partagées
(function () {
  "use strict";

  // API centrale pour les modules
  window.MYM_CONTENT_API = window.MYM_CONTENT_API || {};
  const API = window.MYM_CONTENT_API;

  // Configuration
  API.POLL_INTERVAL_MS =
    (window.APP_CONFIG && window.APP_CONFIG.POLL_INTERVAL_MS) || 10000;
  API.SUBSCRIPTION_CHECK_INTERVAL =
    (window.APP_CONFIG && window.APP_CONFIG.SUBSCRIPTION_CHECK_INTERVAL) ||
    60 * 60 * 1000;
  API.USER_INFO_CACHE_DURATION =
    (window.APP_CONFIG && window.APP_CONFIG.USER_INFO_CACHE_DURATION) ||
    2 * 60 * 1000;
  API.LRU_CACHE_MAX_SIZE =
    (window.APP_CONFIG && window.APP_CONFIG.LRU_CACHE_MAX_SIZE) || 100;
  API.MAX_PAGES_FETCH =
    (window.APP_CONFIG && window.APP_CONFIG.MAX_PAGES_FETCH) || 10;
  API.API_BASE =
    (globalThis.APP_CONFIG && globalThis.APP_CONFIG.API_BASE) ||
    "https://mymchat.fr/api";

  // Feature flags (will be updated by chrome.storage listeners)
  API.badgesEnabled = true;
  API.statsEnabled = true;
  API.emojiEnabled = true;
  API.notesEnabled = true;

  // ========================================
  // SHARED UTILITIES
  // ========================================

  /**
   * Debounce utility to limit function execution frequency
   * Shared across all modules to avoid code duplication
   * @param {Function} func - Function to debounce
   * @param {number} wait - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  API.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  /**
   * Common DOM selectors used across modules
   * Centralized to maintain consistency and reduce duplication
   */
  API.SELECTORS = {
    // Chat page selectors
    CHAT_HEADER: '.chat-header',
    CHAT_CONTAINER: '.chat',
    CHAT_INPUT: '.chat-input__input textarea',
    INPUT_FIELD: '.input__field',
    
    // List selectors
    LIST_ROW: '.list__row',
    LIST_ROW_LEFT: '.list__row__left',
    LIST_ROW_LEFT_BACK: '.list__row__left__back',
    
    // Discussions selectors
    DISCUSSIONS: '.discussions',
    DISCUSSIONS_CHATS: '.discussions__chats',
    DISCUSSIONS_CHAT: '.discussions__chat',
    
    // Sidebar selectors
    SIDEBAR: 'aside.sidebar',
    SIDEBAR_FOOTER: '.sidebar__footer',
    SIDEBAR_FOOTER_LIST: '.sidebar__footer__list',
    
    // Page selectors
    PAGE_MY_MYMS: '.page.my-myms',
    
    // Combined selectors
    LIST_CONTAINERS: '.discussions__chats, .sidebar__footer__list',
    CHAT_PAGES: '.discussions, .page.my-myms, .sidebar__footer__list',
  };

  /**
   * Inject CSS styles into the page
   * Prevents duplicate style injection and provides consistent API
   * @param {string} styleId - Unique ID for the style element
   * @param {string} cssContent - CSS content to inject
   * @returns {HTMLStyleElement} The injected style element or null if already exists
   */
  API.injectStyles = function(styleId, cssContent) {
    // Check if style already exists
    if (document.getElementById(styleId)) {
      return null;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = cssContent;
    document.head.appendChild(style);
    return style;
  };

  /**
   * LRU Cache implementation
   */
  class LRUCache {
    constructor(maxSize = 100) {
      this.maxSize = maxSize;
      this.cache = new Map();
    }

    get(key) {
      if (!this.cache.has(key)) return undefined;
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    has(key) {
      return this.cache.has(key);
    }

    clear() {
      this.cache.clear();
    }

    get size() {
      return this.cache.size;
    }
  }

  API.LRUCache = LRUCache;

  /**
   * Safe storage operations with Firefox/Chrome compatibility
   */
  API.safeStorageGet = function (area, keys) {
    return new Promise((resolve, reject) => {
      // Check if extension context is still valid
      if (!chrome.runtime || !chrome.runtime.id) {
        reject(new Error("Extension context invalidated"));
        return;
      }

      try {
        const storageArea =
          area === "sync"
            ? typeof browser !== "undefined"
              ? browser.storage.sync
              : chrome.storage.sync
            : typeof browser !== "undefined"
            ? browser.storage.local
            : chrome.storage.local;

        storageArea.get(keys, (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(items);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  API.safeStorageSet = function (area, items) {
    return new Promise((resolve, reject) => {
      // Check if extension context is still valid
      if (!chrome.runtime || !chrome.runtime.id) {
        reject(new Error("Extension context invalidated"));
        return;
      }

      try {
        const storageArea =
          area === "sync"
            ? typeof browser !== "undefined"
              ? browser.storage.sync
              : chrome.storage.sync
            : typeof browser !== "undefined"
            ? browser.storage.local
            : chrome.storage.local;

        storageArea.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  API.safeStorageRemove = function (area, keys) {
    return new Promise((resolve, reject) => {
      // Check if extension context is still valid
      if (!chrome.runtime || !chrome.runtime.id) {
        reject(new Error("Extension context invalidated"));
        return;
      }

      try {
        const storageArea =
          area === "sync"
            ? typeof browser !== "undefined"
              ? browser.storage.sync
              : chrome.storage.sync
            : typeof browser !== "undefined"
            ? browser.storage.local
            : chrome.storage.local;

        storageArea.remove(keys, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  /**
   * Check if extension context is still valid
   */
  API.isExtensionValid = function() {
    try {
      return chrome.runtime && chrome.runtime.id !== undefined;
    } catch (e) {
      return false;
    }
  };

  /**
   * User category management
   * Using chrome.storage.sync for cross-browser synchronization
   */
  API.getUserCategory = async function (username) {
    if (!API.isExtensionValid()) {
      throw new Error("Extension context invalidated");
    }
    const items = await API.safeStorageGet("sync", ["user_categories"]);
    const categories = items.user_categories || {};
    return categories[username] || null;
  };

  API.setUserCategory = async function (username, category) {
    const items = await API.safeStorageGet("sync", ["user_categories"]);
    const categories = items.user_categories || {};

    if (category === null || category === "") {
      delete categories[username];
    } else {
      categories[username] = category;
    }

    await API.safeStorageSet("sync", { user_categories: categories });
  };

  /**
   * Extract username from link element
   */
  API.extractUsername = function (link) {
    if (!link) return null;

    const row = link.closest(".list__row");
    if (row) {
      const selectors = [
        ".nickname_profile",
        ".user-card__nickname",
        ".list__row-name",
        ".conversation__name",
      ];

      for (const selector of selectors) {
        const nicknameEl = row.querySelector(selector);
        if (nicknameEl) {
          const username = nicknameEl.textContent.trim();
          if (username && !username.match(/^\d+$/)) {
            return username;
          }
        }
      }
    }

    const text = link.textContent.trim();
    if (text && text.startsWith("@")) {
      return text.substring(1);
    }

    const href = link.getAttribute("href");
    const match = href && href.match(/\/app\/chat\/(?:fan\/\d+\/)?([^\/]+)/);
    return match ? match[1] : null;
  };

  /**
   * Extract username from card element
   */
  API.extractUsernameFromCard = function (card) {
    if (!card) return null;

    const nicknameEl = card.querySelector(
      ".user-card__nickname, .nickname_profile"
    );
    if (nicknameEl) {
      const username = nicknameEl.textContent.trim();
      if (username && !username.match(/^\d+$/)) {
        return username;
      }
    }

    return null;
  };

  /**
   * Get current conversation username
   */
  API.getCurrentConversationUsername = function () {
    // Méthode 1: Depuis le header
    const chatHeaderNickname = document.querySelector(
      ".chat__header .nickname_profile, .content-search-bar .nickname_profile, main .nickname_profile"
    );

    if (chatHeaderNickname) {
      let username = chatHeaderNickname.textContent.trim();
      username = username.replace(/[^\w@_.-]/g, "");
      if (username.startsWith("@")) {
        username = username.substring(1);
      }
      if (username && username.length > 0 && !username.match(/^\d+$/)) {
        return username;
      }
    }

    // Méthode 2: Depuis le lien profil
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

    // Méthode 3: Depuis l'URL
    const urlMatch = location.pathname.match(/\/app\/chat\/([^\/]+)$/);
    if (
      urlMatch &&
      urlMatch[1] &&
      urlMatch[1] !== "fan" &&
      !urlMatch[1].match(/^\d+$/)
    ) {
      return urlMatch[1];
    }

    // Méthode 4: Depuis sidebar active
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
  };

  /**
   * Get user identifier (username or chat ID)
   */
  API.getUserIdentifier = function () {
    const username = API.getCurrentConversationUsername();
    if (username) {
      return { type: "username", username: username, id: null };
    }

    const chatId = API.getChatId();
    if (chatId) {
      return { type: "chatId", username: `Chat ${chatId}`, id: chatId };
    }

    return { type: "unknown", username: "Unknown", id: null };
  };

  /**
   * Get current chat ID
   */
  API.getChatId = function () {
    const el = document.querySelector("[data-chat-id]");
    if (el) {
      const v = el.getAttribute("data-chat-id") || el.dataset.chatId;
      if (v) return v.toString();
    }
    const m = location.pathname.match(/\/app\/chat\/(\d+)/);
    if (m) return m[1];
    return null;
  };

  /**
   * Format currency
   */
  API.formatCurrency = function (amount) {
    return amount.toFixed(2) + "€";
  };

  /**
   * Debounce function
   */
  API.debounce = function (func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  /**
   * Throttle function
   */
  API.throttle = function (func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  };

  // console.log("✅ [MYM Core] Module loaded");
})();
