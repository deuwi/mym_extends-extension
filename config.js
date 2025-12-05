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

// Export de la configuration active
const activeConfig = CONFIG[ENVIRONMENT];

// Variables globales accessibles dans toute l'extension
// Utilise globalThis pour compatibilité service worker et content scripts
const APP_CONFIG = {
  ENVIRONMENT,
  API_BASE: activeConfig.API_BASE,
  FRONTEND_URL: activeConfig.FRONTEND_URL,
  SIGNIN_URL: activeConfig.SIGNIN_URL,
};

// Export pour window (content scripts) et globalThis (service worker)
if (typeof window !== "undefined") {
  window.APP_CONFIG = APP_CONFIG;
}
globalThis.APP_CONFIG = APP_CONFIG;
