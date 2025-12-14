/**
 * config.js - Centralized configuration for MYM Chat Live Extension
 * Allows easy switching between local and production environments
 * @module config
 */

// ⚙️ Environment: "local" | "production"
const ENVIRONMENT = "production";

// 🐛 Debug mode: set to true to enable console logging
const DEBUG = false;

/**
 * Environment-specific configuration
 * @type {Object.<string, {API_BASE: string, FRONTEND_URL: string, SIGNIN_URL: string, CREATORS_URL: string, PRICING_URL: string}>}
 */
const CONFIG = {
  local: {
    API_BASE: "http://127.0.0.1:8080/api",
    FRONTEND_URL: "http://localhost:5173",
    SIGNIN_URL: "http://localhost:5173/signin",
    CREATORS_URL: "https://creators.mym.fans",
    PRICING_URL: "http://localhost:5173/pricing",
  },
  production: {
    API_BASE: "https://mymchat.fr/api",
    FRONTEND_URL: "https://mymchat.fr",
    SIGNIN_URL: "https://mymchat.fr/signin",
    CREATORS_URL: "https://creators.mym.fans",
    PRICING_URL: "https://mymchat.fr/pricing",
  },
};

// ⚙️ Paramètres de timing et de cache (en millisecondes)
const TIMING_CONFIG = {
  // Durée de vie des tokens
  TOKEN_MAX_AGE: 365 * 24 * 60 * 60 * 1000, // 365 jours

  // Intervalles de vérification
  POLL_INTERVAL_MS: 10000, // 10 secondes - polling des nouveaux messages
  SUBSCRIPTION_CHECK_INTERVAL: 30 * 60 * 1000, // 30 minutes - vérification abonnement (deprecated - utiliser SUBSCRIPTION_CHECK_INTERVAL_MIN)
  SUBSCRIPTION_CHECK_INTERVAL_MIN: 30, // 30 minutes - vérification abonnement (pour chrome.alarms)
  LICENSE_CHECK_INTERVAL_MIN: 30, // 30 minutes - vérification licence agence
  TOKEN_REFRESH_INTERVAL_MIN: 45, // 45 minutes - rafraîchissement proactif du token Firebase (expire après 1h)

  // Cache
  USER_INFO_CACHE_DURATION: 2 * 60 * 1000, // 2 minutes
  LRU_CACHE_MAX_SIZE: 100, // Taille maximale du cache LRU

  // Limites de sécurité
  MAX_PAGES_FETCH: 10, // Limite de pages à récupérer
  RELOAD_LOOP_THRESHOLD: 3, // Nombre de rechargements avant détection de boucle
  RELOAD_LOOP_WINDOW: 30000, // 30 secondes - fenêtre pour détection de boucle
};

// 🎨 Thème et couleurs de l'extension
const THEME_CONFIG = {
  // Gradient principal (violet)
  PRIMARY_GRADIENT_START: "rgb(102, 126, 234)",
  PRIMARY_GRADIENT_END: "rgb(118, 75, 162)",

  // Couleurs d'état
  HOVER_OVERLAY: "rgba(255, 255, 255, 0.2)",
  BORDER_LIGHT: "rgba(255, 255, 255, 0.3)",
};

/**
 * Helper function for conditional logging
 * Only logs when DEBUG is enabled
 * @param {...any} args - Arguments to log
 */
const debugLog = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};

// Export active configuration
const activeConfig = CONFIG[ENVIRONMENT];

/**
 * Global configuration object accessible throughout the extension
 * Uses globalThis for compatibility with both service workers and content scripts
 * @type {Object}
 */
const APP_CONFIG = {
  ENVIRONMENT,
  DEBUG,
  API_BASE: activeConfig.API_BASE,
  FRONTEND_URL: activeConfig.FRONTEND_URL,
  SIGNIN_URL: activeConfig.SIGNIN_URL,
  CREATORS_URL: activeConfig.CREATORS_URL,
  PRICING_URL: activeConfig.PRICING_URL,
  ...TIMING_CONFIG,
  ...THEME_CONFIG,
  debugLog, // Helper function for conditional logging
};

// Export for window (content scripts) and globalThis (service worker)
if (typeof window !== "undefined") {
  window.APP_CONFIG = APP_CONFIG;
  window.debugLog = debugLog;
}
globalThis.APP_CONFIG = APP_CONFIG;
globalThis.debugLog = debugLog;
