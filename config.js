// config.js - Configuration centralisée pour l'extension MYM Chat Live
// Permet de basculer facilement entre environnement local et production

// Environnement actuel : "local" ou "production"
const ENVIRONMENT = "production";

// Configuration par environnement
const CONFIG = {
  local: {
    API_BASE: "http://127.0.0.1:8080/api",
    FRONTEND_URL: "http://localhost:5173",
    SIGNIN_URL: "http://localhost:5173/signin",
  },
  production: {
    API_BASE: "https://mymchat.fr/api",
    FRONTEND_URL: "https://mymchat.fr",
    SIGNIN_URL: "https://mymchat.fr/signin",
  },
};

// ⚙️ Paramètres de timing et de cache (en millisecondes)
const TIMING_CONFIG = {
  // Durée de vie des tokens
  TOKEN_MAX_AGE: 365 * 24 * 60 * 60 * 1000, // 365 jours

  // Intervalles de vérification
  POLL_INTERVAL_MS: 10000, // 10 secondes - polling des nouveaux messages
  SUBSCRIPTION_CHECK_INTERVAL: 60 * 60 * 1000, // 1 heure - vérification abonnement
  LICENSE_CHECK_INTERVAL_MIN: 30, // 30 minutes - vérification licence (en minutes)
  TOKEN_REFRESH_INTERVAL_MIN: 50, // 50 minutes - rafraîchissement token Firebase (en minutes)

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

// Export de la configuration active
const activeConfig = CONFIG[ENVIRONMENT];

// Variables globales accessibles dans toute l'extension
// Utilise globalThis pour compatibilité service worker et content scripts
const APP_CONFIG = {
  ENVIRONMENT,
  API_BASE: activeConfig.API_BASE,
  FRONTEND_URL: activeConfig.FRONTEND_URL,
  SIGNIN_URL: activeConfig.SIGNIN_URL,
  ...TIMING_CONFIG,
  ...THEME_CONFIG,
};

// Export pour window (content scripts) et globalThis (service worker)
if (typeof window !== "undefined") {
  window.APP_CONFIG = APP_CONFIG;
}
globalThis.APP_CONFIG = APP_CONFIG;
