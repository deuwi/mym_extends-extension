// background.js - Initialize default values on extension install

// Configuration déjà définie dans config.js (chargé avant background.js dans Firefox Manifest V2)
// Dans Firefox MV2: Les scripts partagent le même scope global, config.js déclare déjà const APP_CONFIG
// Dans Chrome MV3: Service worker isolé, besoin de créer APP_CONFIG
if (typeof globalThis.APP_CONFIG === 'undefined') {
  // Fallback pour Chrome service worker si config.js n'est pas chargé
  globalThis.APP_CONFIG = {
    DEBUG: false,
    API_BASE: "https://chat4creators.fr/api",
    POLL_INTERVAL_MS: 10000,
    SUBSCRIPTION_CHECK_INTERVAL: 5 * 60 * 1000,
    USER_INFO_CACHE_DURATION: 2 * 60 * 1000,
    LRU_CACHE_MAX_SIZE: 100,
    MAX_PAGES_FETCH: 10,
    TOKEN_MAX_AGE: 365 * 24 * 60 * 60 * 1000
  };
}

// NE PAS redéclarer APP_CONFIG ici - utiliser celui de config.js ou globalThis.APP_CONFIG
// Firefox: APP_CONFIG existe déjà dans le scope global (déclaré par config.js)
// Chrome: APP_CONFIG n'existe pas, on l'utilise via globalThis

// Disable navigation preload warning for service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Disable navigation preload if it's enabled
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable();
      }
    })()
  );
});

// 🦊 Firefox utilise 'browser' nativement, Chrome utilise 'chrome'
// On créé un alias unifié
if (typeof browser !== "undefined") {
  // Firefox - utiliser l'API native
  if (typeof chrome === "undefined") {
    globalThis.chrome = browser;
  }
}

if (APP_CONFIG.DEBUG) console.log("🚀 [BACKGROUND] Script starting...");
// console.log(
//   "🔍 [BACKGROUND] Runtime detected:",
//   typeof browser !== "undefined"
//     ? "Firefox (browser API)"
//     : "Chrome (chrome API)"
// );

// Configuration is loaded via manifest.json scripts array for Firefox compatibility
try {
  // console.log(
  //   "🔍 [BACKGROUND] Checking APP_CONFIG:",
  //   typeof globalThis.APP_CONFIG
  // );
  if (APP_CONFIG.DEBUG) console.log("🔍 [BACKGROUND] APP_CONFIG value:", globalThis.APP_CONFIG);
} catch (e) {
  console.error("❌ [BACKGROUND] Error checking APP_CONFIG:", e);
}

const API_BASE =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.API_BASE) ||
  "https://chat4creators.fr/api";
const TOKEN_MAX_AGE =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.TOKEN_MAX_AGE) ||
  365 * 24 * 60 * 60 * 1000;
if (APP_CONFIG.DEBUG) console.log(`🔧 [BACKGROUND] Loaded with API_BASE: ${API_BASE}`);
// console.log(
//   `🔧 [BACKGROUND] TOKEN_MAX_AGE: ${
//     TOKEN_MAX_AGE / (24 * 60 * 60 * 1000)
//   } jours`
// );
if (APP_CONFIG.DEBUG) console.log("✅ [BACKGROUND] Initialization complete");

// 🎨 Fonction pour mettre à jour l'icône de l'extension selon le statut
// Mettre à jour l'icône basée sur l'état RÉEL des fonctionnalités
async function updateExtensionIconBasedOnFeatures() {
  try {
    const data = await chrome.storage.local.get([
      'firebaseToken',
      'access_token',
      'mym_live_enabled',
      'mym_badges_enabled',
      'mym_stats_enabled',
      'mym_emoji_enabled',
      'mym_notes_enabled',
      'subscription_active',
      'trial_days_remaining',
      'agency_license_active'
    ]);
    
    const hasToken = data.firebaseToken || data.access_token;
    const anyFeatureEnabled = data.mym_live_enabled || 
                             data.mym_badges_enabled || 
                             data.mym_stats_enabled || 
                             data.mym_emoji_enabled || 
                             data.mym_notes_enabled;
    
    // Vérifier si l'utilisateur a un accès valide (abonnement, trial ou licence agence)
    const hasActiveAccess = data.subscription_active || 
                           (data.trial_days_remaining && data.trial_days_remaining > 0) ||
                           data.agency_license_active;
    
    if (APP_CONFIG.DEBUG) {
      console.log("🎨 [BACKGROUND] Icon update check:", {
        hasToken,
        anyFeatureEnabled,
        hasActiveAccess,
        features: {
          live: data.mym_live_enabled,
          badges: data.mym_badges_enabled,
          stats: data.mym_stats_enabled,
          emoji: data.mym_emoji_enabled,
          notes: data.mym_notes_enabled
        }
      });
    }
    
    if (hasToken && anyFeatureEnabled) {
      updateExtensionIcon("connected");
    } else if (hasToken && !anyFeatureEnabled && hasActiveAccess) {
      // L'utilisateur a un accès mais les features ne sont pas encore chargées
      // On attend un peu avant de mettre l'icône en erreur
      if (APP_CONFIG.DEBUG) console.log("⚠️ [BACKGROUND] Token + access but no features enabled yet, keeping current icon");
      // Ne rien faire, garder l'icône actuelle
    } else if (hasToken && !anyFeatureEnabled && !hasActiveAccess) {
      // Pas d'accès premium
      updateExtensionIcon("error");
    } else if (!hasToken) {
      updateExtensionIcon("disconnected");
    }
  } catch (err) {
    console.error("❌ [BACKGROUND] Error updating icon based on features:", err);
  }
}

function updateExtensionIcon(status) {
  const iconSets = {
    connected: {
      16: "icons/icon-connected-16.png",
      48: "icons/icon-connected-48.png",
      128: "icons/icon-connected-128.png",
    },
    disconnected: {
      16: "icons/icon-disconnected-16.png",
      48: "icons/icon-disconnected-48.png",
      128: "icons/icon-disconnected-128.png",
    },
    error: {
      16: "icons/icon-error-16.png",
      48: "icons/icon-error-48.png",
      128: "icons/icon-error-128.png",
    },
  };

  try {
    // Chrome MV3 utilise chrome.action, Firefox MV2 utilise chrome.browserAction
    // Safari peut utiliser browser.browserAction
    const iconAPI =
      chrome.action ||
      chrome.browserAction ||
      (typeof browser !== "undefined" && browser.browserAction);

    if (iconAPI && iconAPI.setIcon) {
      const iconPath = iconSets[status] || iconSets.disconnected;

      // Safari et Firefox peuvent nécessiter un callback
      iconAPI.setIcon(
        {
          path: iconPath,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.warn(
              "⚠️ [BACKGROUND] Icon update warning:",
              chrome.runtime.lastError.message
            );
          } else {
            if (APP_CONFIG.DEBUG) console.log(`🎨 [BACKGROUND] Icon updated to: ${status}`);
          }
        }
      );
    } else {
      console.warn("⚠️ [BACKGROUND] Icon API not available");
    }
  } catch (err) {
    console.error("❌ [BACKGROUND] Error updating icon:", err);
  }
}

// Variable pour éviter les mises à jour d'icône trop rapides au démarrage
let startupIconUpdateTimeout = null;

// 🔄 Vérifier le statut de connexion au démarrage
function checkConnectionStatus() {
  chrome.storage.local.get(
    ["firebaseToken", "access_token", "user_email"],
    (data) => {
      const safeData = data || {};
      if (safeData.firebaseToken || safeData.access_token) {
        // Au démarrage, on met l'icône en "connected" optimiste
        updateExtensionIcon("connected");
        
        // Vérifier l'état réel après 2 secondes
        if (startupIconUpdateTimeout) clearTimeout(startupIconUpdateTimeout);
        startupIconUpdateTimeout = setTimeout(() => {
          updateExtensionIconBasedOnFeatures();
        }, 2000);
      } else {
        updateExtensionIcon("disconnected");
      }
    }
  );
}

// 🔄 Initialiser l'icône selon l'état actuel au démarrage
(async function initializeIcon() {
  try {
    const data = await chrome.storage.local.get([
      'firebaseToken',
      'access_token',
      'subscription_active',
      'trial_days_remaining',
      'agency_license_active'
    ]);
    
    // Vérifier que data existe et n'est pas undefined
    if (!data) {
      updateExtensionIcon("disconnected");
      return;
    }
    
    const hasToken = data.firebaseToken || data.access_token;
    const hasActiveAccess = data.subscription_active || 
                           (data.trial_days_remaining && data.trial_days_remaining > 0) ||
                           data.agency_license_active;
    
    if (hasToken && hasActiveAccess) {
      updateExtensionIcon("connected");
    } else if (hasToken && !hasActiveAccess) {
      updateExtensionIcon("error");
    } else {
      updateExtensionIcon("disconnected");
    }
  } catch (err) {
    console.error("❌ [BACKGROUND] Error initializing icon:", err);
    updateExtensionIcon("disconnected");
  }
})();

// 🌉 Écouter les messages du auth-bridge (connexion Google depuis le site web)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 🔄 REFRESH TOKEN SI NÉCESSAIRE (depuis content.js quand page redevient visible)
  if (message.type === "REFRESH_TOKEN_IF_NEEDED") {
    refreshFirebaseToken()
      .then(() => {
        sendResponse({ success: true, refreshed: true });
      })
      .catch((error) => {
        console.error("❌ Error refreshing token:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indique qu'on va répondre de manière asynchrone
  }

  // 🔓 Message pour vérifier la licence agence
  if (message.action === "checkLicense") {
    if (APP_CONFIG.DEBUG) console.log("📨 Message reçu: vérification de la licence demandée");

    // ℹ️ Les fonctionnalités de base sont toujours accessibles
    // Seules les fonctionnalités premium nécessitent un abonnement
    (async () => {
      try {
        await checkAndEnableFeatures();
        sendResponse({ success: true });
      } catch (error) {
        console.error("❌ [BACKGROUND] Erreur checkAndEnableFeatures:", error);
        sendResponse({ success: false, reason: "error" });
      }
    })();

    return true; // Indique qu'on va répondre de manière asynchrone
  }

  // 🔥 Nouveau: Support pour Firebase Token depuis la page web
  if (message.type === "FIREBASE_TOKEN" && message.token) {
    if (APP_CONFIG.DEBUG) console.log("✅ Background: Received Firebase token from web");

    // Vérifier d'abord que l'email est vérifié
    if (message.emailVerified === false) {
      console.warn("❌ Background: Email non vérifié, rejet du token");
      
      // Informer l'utilisateur
      sendResponse({
        success: false,
        error: "Votre email n'est pas vérifié. Vérifiez votre boîte mail.",
      });

      // Mettre l'icône en état d'erreur
      updateExtensionIcon("error");

      return;
    }

    // IMPORTANT: Vérifier que le token n'est pas expiré avant de le stocker
    if (APP_CONFIG.DEBUG) console.log("🔍 Background: Validating Firebase token...");

    // Tester le token en appelant le backend
    fetch(API_BASE + "/check-subscription", {
      headers: {
        Authorization: `Bearer ${message.token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error(
            "❌ Background: Token invalide ou expiré (HTTP",
            res.status,
            ")"
          );

          // Informer l'utilisateur que le token est expiré
          sendResponse({
            success: false,
            error: "Token expiré. Veuillez vous reconnecter.",
          });

          // Fermer l'onglet d'authentification
          if (sender.tab && sender.tab.id) {
            chrome.tabs.get(sender.tab.id, (tab) => {
              if (!chrome.runtime.lastError && tab) {
                chrome.tabs.remove(sender.tab.id);
              }
            });
          }

          return;
        }

        // Token valide, le stocker
        if (APP_CONFIG.DEBUG) console.log("✅ Background: Token validé avec succès");

        // Stocker le token + email + user_id + timestamp
        // SANS activer automatiquement les features (il faut vérifier l'abonnement d'abord)
        chrome.storage.local.set(
          {
            firebaseToken: message.token,
            user_email: message.user_email || "",
            user_id: message.user_id || "",
            access_token_stored_at: Date.now(), // Important: stocker la date pour vérifier l'expiration
          },
          async () => {
            // Ne pas mettre l'icône à "connected" tout de suite
            // Vérifier d'abord le statut d'abonnement qui mettra à jour l'icône
            try {
              await checkSubscriptionStatus();
              // Si l'abonnement est valide, les features seront activées automatiquement
              // Sinon, l'utilisateur restera connecté mais sans accès aux features
              
              // Envoyer une réponse au content script APRÈS vérification
              sendResponse({ success: true });
            } catch (error) {
              console.error("❌ Background: Erreur vérification abonnement:", error);
              sendResponse({ success: false, error: "Erreur de vérification" });
            }

            // Fermer l'onglet d'authentification si c'est le sender
            if (sender.tab && sender.tab.id) {
              chrome.tabs.get(sender.tab.id, (tab) => {
                if (!chrome.runtime.lastError && tab) {
                  chrome.tabs.remove(sender.tab.id);
                }
              });
            }
          }
        );
      })
      .catch((error) => {
        console.error("❌ Background: Erreur validation token:", error);
        sendResponse({
          success: false,
          error: "Erreur de validation du token",
        });
      });

    return true; // Indique qu'on va répondre de manière asynchrone
  }

  if (message.type === "GOOGLE_AUTH_SUCCESS") {
    // console.log(
    //   "✅ Background: Received Google auth token from web",
    //   message.data
    // );

    // Stocker le token dans chrome.storage (ne pas toucher aux features - respecter le choix de l'utilisateur)
    chrome.storage.local.set(
      {
        access_token: message.data.access_token,
        user_email: message.data.user_email,
        user_id: message.data.user_id,
        access_token_stored_at: message.data.access_token_stored_at,
      },
      () => {
        // if (APP_CONFIG.DEBUG) console.log("✅ Background: Token stored and features enabled");
        // console.log(
        //   "🔍 Token reçu:",
        //   message.data.access_token?.substring(0, 20) + "..."
        // );

        // Vérifier immédiatement le statut d'abonnement
        checkSubscriptionStatus();

        // Envoyer une réponse au content script
        sendResponse({ success: true });
      }
    );

    // Retourner true pour indiquer qu'on va répondre de manière asynchrone
    return true;
  }
});

// 🚀 Initialiser les alarmes au démarrage du navigateur
chrome.runtime.onStartup.addListener(() => {
  if (APP_CONFIG.DEBUG) console.log("🚀 [BACKGROUND] Browser startup - reinitializing alarms");
  startSubscriptionCheck();
});

chrome.runtime.onInstalled.addListener(() => {
  // Set all features to disabled by default (user must login first)
  const defaults = {
    mym_live_enabled: false,
    mym_badges_enabled: false,
    mym_stats_enabled: false,
    mym_emoji_enabled: false,
    mym_notes_enabled: false,
  };

  chrome.storage.local.get(Object.keys(defaults), (items) => {
    const safeItems = items || {};
    const updates = {};

    // Only set values that don't exist yet
    Object.entries(defaults).forEach(([key, value]) => {
      if (safeItems[key] === undefined) {
        updates[key] = value;
      }
    });

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        // console.log(
        //   "✅ MYM Chat Live: Extension installée. Connectez-vous pour activer les fonctionnalités."
        // );
      });
    }
  });

  // Start periodic subscription check
  startSubscriptionCheck();
});

// 🔒 Vérification périodique du statut Premium/Trial
function startSubscriptionCheck() {
  const intervalMinutes =
    (globalThis.APP_CONFIG &&
      globalThis.APP_CONFIG.SUBSCRIPTION_CHECK_INTERVAL_MIN) ||
    30; // Fallback: 30 minutes
  
  console.log(`⏰ [BACKGROUND] Subscription check alarm: every ${intervalMinutes} minutes`);
  
  // Créer une alarme périodique pour vérifier le statut d'abonnement
  chrome.alarms.create("checkSubscriptionAlarm", {
    periodInMinutes: intervalMinutes,
  });
  
  // Créer une alarme pour vérifier après 1 minute (délai initial)
  chrome.alarms.create("initialSubscriptionCheck", {
    delayInMinutes: 0.1, // 6 secondes (minimum supporté)
  });
}

// Debounce pour éviter les appels multiples rapprochés
let lastCheckTime = 0;
const CHECK_COOLDOWN = 5000; // 5 secondes minimum entre deux vérifications

// Flag pour éviter les boucles infinies lors de la désactivation
let isDisablingFeatures = false;

async function checkSubscriptionStatus(force = false) {
  const now = Date.now();
  
  // Ignorer si déjà vérifié il y a moins de 5 secondes (sauf si force=true)
  if (!force && (now - lastCheckTime) < CHECK_COOLDOWN) {
    if (APP_CONFIG.DEBUG) console.log("⏭️ [BACKGROUND] Subscription check skipped (cooldown)");
    return Promise.resolve();
  }
  
  lastCheckTime = now;
  
  chrome.storage.local.get(
    ["access_token", "firebaseToken", "access_token_stored_at", "user_email"],
    async (data) => {
      const safeData = data || {};
      // Priorité au firebaseToken, sinon access_token
      const token = safeData.firebaseToken || safeData.access_token;
      const email = safeData.user_email;
      const tokenTime = safeData.access_token_stored_at || 0;
      const now = Date.now();
      const ageMs = now - tokenTime;
      const ninetyDays = 365 * 24 * 60 * 60 * 1000; // 365 jours au lieu de 90

      // Si pas de token ni email, ne rien faire (utilisateur pas connecté)
      if (!token && !email) {
        if (APP_CONFIG.DEBUG) console.log("ℹ️ Pas de token - utilisateur non connecté");
        return;
      }

      // Vérifier si le token JWT est expiré en décodant le claim 'exp'
      if (token) {
        try {
          const base64Url = token.split('.')[1];
          if (base64Url) {
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const decoded = JSON.parse(jsonPayload);
            
            if (decoded.exp) {
              const expiresAt = decoded.exp * 1000; // Convert to milliseconds
              const tokenNow = Date.now();
              
              if (tokenNow >= expiresAt) {
                if (APP_CONFIG.DEBUG) console.log("🚫 [BACKGROUND] Token JWT expiré - tentative de rafraîchissement");
                // Token expiré, tenter de le rafraîchir
                await refreshFirebaseToken();
                
                // Créer une alarme pour revérifier après refresh
                chrome.alarms.create("recheckAfterTokenRefresh", {
                  delayInMinutes: 0.05 // ~3 secondes
                });
                return; // Sortir ici pour éviter la double vérification
              }
            }
          }
        } catch (err) {
          console.warn("⚠️ [BACKGROUND] Erreur décodage token JWT:", err);
        }
      }

      // Si token trop vieux (365 jours), passer en mode gratuit
      if (token && ageMs > ninetyDays) {
        console.warn("⚠️ [BACKGROUND] Token trop vieux (>365 jours) - mode gratuit");
        chrome.storage.local.set({ subscription_active: false });
        updateExtensionIcon("error");
        return;
      }

      // Vérifier le statut avec le backend
      try {
        // Déterminer si on est en mode local
        const isLocal =
          (globalThis.APP_CONFIG && globalThis.APP_CONFIG.ENVIRONMENT) ===
          "local";

        // En mode local, utiliser les headers de dev au lieu du token Firebase
        const headers = isLocal
          ? {
              "X-Dev-User-Email": email || "dev@test.com",
              "X-Dev-User-ID": "dev-user",
            }
          : { Authorization: `Bearer ${token}` };

        const res = await fetch(API_BASE + "/check-subscription", {
          headers,
        });

        if (!res.ok) {
          if (res.status === 401) {
            // Token expiré - Vérifier l'abonnement par email avant de désactiver
            if (APP_CONFIG.DEBUG) console.log("🔒 [BACKGROUND] Token 401 - vérification abonnement par email...");
            
            if (email) {
              try {
                const emailCheckRes = await fetch(`${API_BASE}/check-subscription`, {
                  method: "GET",
                  headers: isLocal
                    ? {
                        "X-Dev-User-Email": email,
                        "X-Dev-User-ID": "dev-user",
                      }
                    : {
                        "X-User-Email": email,
                      },
                });
                
                if (emailCheckRes.ok) {
                  const emailResult = await emailCheckRes.json();
                  
                  if (emailResult.subscription_active || emailResult.trial_days_remaining > 0 || emailResult.agency_license_active) {
                    if (APP_CONFIG.DEBUG) console.log("✅ [BACKGROUND] Abonnement valide via email - conservation des fonctionnalités");
                    updateExtensionIcon("connected");
                    
                    // Tenter de rafraîchir le token en arrière-plan pour la prochaine fois
                    refreshFirebaseToken();
                    return;
                  }
                }
              } catch (emailCheckErr) {
                console.warn("⚠️ [BACKGROUND] Erreur vérification par email:", emailCheckErr);
              }
            }
            
            // Si vraiment impossible de vérifier, tenter de rafraîchir le token
            if (APP_CONFIG.DEBUG) console.log("🔄 [BACKGROUND] Tentative rafraîchissement token...");
            await refreshFirebaseToken();
            
            // Créer une alarme pour revérifier
            chrome.alarms.create("recheckAfterTokenRefresh", {
              delayInMinutes: 0.05 // ~3 secondes
            });
          } else {
            // Pour les autres erreurs (500, 503, etc.), on GARDE les features actives
            if (APP_CONFIG.DEBUG) console.log(`⚠️ [BACKGROUND] Erreur API ${res.status} - features conservées temporairement`);
          }
          return;
        }

        // Vérifier que la réponse est bien du JSON
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.warn(
            `⚠️ Réponse non-JSON reçue (${contentType}), probablement une erreur serveur`
          );
          return;
        }

        const result = await res.json();

        // Vérifier si l'email est vérifié (depuis le champ de la réponse)
        if (result.email_verified === false) {
          console.warn("⚠️ [BACKGROUND] Email non vérifié - mode gratuit");
          chrome.storage.local.set({ subscription_active: false, email_verified: false });
          updateExtensionIcon("error");

          // Informer l'utilisateur (si disponible)
          if (chrome.notifications && chrome.notifications.create) {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icons/icon-error-128.png",
              title: "Email non vérifié",
              message:
                "Veuillez vérifier votre adresse email pour accéder aux fonctionnalités premium.",
              priority: 2,
            });
          }

          return;
        }

        // Vérifier si l'abonnement est actif OU période d'essai valide
        const hasAccess = result.subscription_active || result.trial_days_remaining > 0 || result.agency_license_active;
        
        // Sauvegarder le statut d'abonnement
        chrome.storage.local.set({
          subscription_active: hasAccess,
          trial_days_remaining: result.trial_days_remaining || 0,
          agency_license_active: result.agency_license_active || false,
          email_verified: true
        });

        if (hasAccess) {
          console.log("✅ [BACKGROUND] Abonnement actif - accès premium");
          updateExtensionIcon("connected");
        } else {
          console.warn("⚠️ [BACKGROUND] Abonnement expiré - mode gratuit activé");
          updateExtensionIcon("error");
          
          // Notification à l'utilisateur (si disponible)
          if (chrome.notifications && chrome.notifications.create) {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icons/icon-error-128.png",
              title: "Abonnement expiré",
              message: "Mode gratuit activé. Renouvelez votre abonnement pour accéder aux fonctionnalités premium.",
              priority: 2,
            });
          }
        }
      } catch (err) {
        console.error("❌ Erreur vérification statut:", err);
        // En cas d'erreur réseau/serveur, on GARDE les features actives
        // L'utilisateur peut continuer à utiliser l'extension
      }
    } // Fin du callback async chrome.storage.local.get
  ); // Fin de chrome.storage.local.get
} // Fin de checkSubscriptionStatus

// checkSubscriptionStatusSync() supprimée - code mort (pas utilisée)
// La vérification se fait via checkSubscriptionStatus() ou checkAndEnableFeatures()

function disableAllFeatures(iconState = "disconnected", bypassManualCheck = false) {
  if (APP_CONFIG.DEBUG) console.log(`🚫 [BACKGROUND] disableAllFeatures called with icon: ${iconState}, bypass: ${bypassManualCheck}`);
  
  // Prévenir les boucles infinies
  if (isDisablingFeatures) {
    if (APP_CONFIG.DEBUG) console.log("⏭️ [BACKGROUND] Already disabling features, skipping...");
    return;
  }
  
  isDisablingFeatures = true;
  
  chrome.storage.local.get(
    [
      "mym_live_enabled",
      "mym_badges_enabled",
      "mym_stats_enabled",
      "mym_emoji_enabled",
      "mym_notes_enabled",
      "user_manual_toggle_timestamp", // Timestamp du dernier toggle manuel
    ],
    (currentState) => {
      const safeState = currentState || {};
      
      // 🚫 Ne pas désactiver si l'utilisateur vient de toggle manuellement (< 5 secondes)
      // SAUF si c'est un appel automatique du système (bypassManualCheck = true)
      if (!bypassManualCheck) {
        const manualToggleTimestamp = safeState.user_manual_toggle_timestamp || 0;
        const timeSinceManualToggle = Date.now() - manualToggleTimestamp;
        
        if (timeSinceManualToggle < 5000) {
          if (APP_CONFIG.DEBUG) console.log("⏸️ [BACKGROUND] Ignoring disableAllFeatures - user just toggled manually (protection)");
          updateExtensionIcon(iconState);
          return;
        }
      }
      
      if (APP_CONFIG.DEBUG) console.log("📊 [BACKGROUND] Current features state:", safeState);
      const wasAnyEnabled = Object.values(safeState).some(
        (val) => val === true
      );
      if (APP_CONFIG.DEBUG) console.log(`📊 [BACKGROUND] Any feature was enabled: ${wasAnyEnabled}`);

      chrome.storage.local.set(
        {
          mym_live_enabled: false,
          mym_badges_enabled: false,
          mym_stats_enabled: false,
          mym_emoji_enabled: false,
          mym_notes_enabled: false,
        },
        async () => {
          if (APP_CONFIG.DEBUG) console.log("🚫 Toutes les fonctionnalités désactivées");
          await updateExtensionIconBasedOnFeatures();
          
          // Réinitialiser le flag après un court délai
          setTimeout(() => {
            isDisablingFeatures = false;
          }, 1000);

          // ⚠️ NE PAS recharger ici - le content.js s'en charge via storage.onChanged
          // Évite les doubles rechargements
        }
      );
    }
  );
}

// 🔓 Vérifier et activer automatiquement les fonctionnalités si licence agence active
async function checkAndEnableFeatures() {
  try {
    const API_BASE =
      (globalThis.APP_CONFIG && globalThis.APP_CONFIG.API_BASE) ||
      "https://chat4creators.fr/api";
    const isLocal =
      (globalThis.APP_CONFIG && globalThis.APP_CONFIG.ENVIRONMENT) === "local";

    // Récupérer les données d'authentification
    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "firebaseToken",
          "access_token",
          "user_email",
          "access_token_stored_at",
        ],
        resolve
      );
    });
    const safeStorageData = storageData || {};
    const token = safeStorageData.firebaseToken || safeStorageData.access_token;
    const email = safeStorageData.user_email;
    const tokenStoredAt = safeStorageData.access_token_stored_at;

    // Aucune fonctionnalité disponible sans connexion
    // Toutes les fonctionnalités nécessitent un abonnement actif
    if (!token && !email) {
      if (APP_CONFIG.DEBUG) console.log("ℹ️ Pas de token - désactivation de toutes les fonctionnalités");
      // Aucune fonctionnalité disponible en mode gratuit
      await chrome.storage.local.set({
        mym_live_enabled: false,
        mym_badges_enabled: false,
        mym_stats_enabled: false,
        mym_emoji_enabled: false,
        mym_notes_enabled: false,
        subscription_active: false
      });
      updateExtensionIcon("disconnected");
      return; // Sortir ici
    }

    // Vérifier l'âge du token SEULEMENT si on a un access_token (pas pour firebaseToken seul)
    if (tokenStoredAt && safeStorageData.access_token) {
      const tokenAge = Date.now() - tokenStoredAt;
      if (tokenAge > TOKEN_MAX_AGE) {
        currentRefreshCycleAttempts++;
        
        if (currentRefreshCycleAttempts > MAX_REFRESH_ATTEMPTS_PER_CYCLE) {
          console.error(`❌ [BACKGROUND] Token trop vieux et refresh impossible après ${MAX_REFRESH_ATTEMPTS_PER_CYCLE} tentatives`);
          console.error("💡 Déconnexion de l'utilisateur - veuillez vous reconnecter.");
          
          // Déconnecter complètement l'utilisateur
          await chrome.storage.local.remove([
            "firebaseToken",
            "access_token",
            "access_token_stored_at",
            "user_email",
            "user_id"
          ]);
          
          // Désactiver les fonctionnalités
          await chrome.storage.local.set({
            mym_live_enabled: false,
            mym_badges_enabled: false,
            mym_stats_enabled: false,
            mym_emoji_enabled: false,
            mym_notes_enabled: false,
            subscription_active: false,
            trial_days_remaining: 0,
            agency_license_active: false
          });
          updateExtensionIcon("disconnected");
          currentRefreshCycleAttempts = 0;
          return;
        }
        
        console.warn(
          `⚠️ [BACKGROUND] Token expiré (âge: ${Math.floor(
            tokenAge / (24 * 60 * 60 * 1000)
          )} jours) - tentative rafraîchissement (${currentRefreshCycleAttempts}/${MAX_REFRESH_ATTEMPTS_PER_CYCLE})`
        );
        
        // Tenter de rafraîchir le token avant de désactiver
        await refreshFirebaseToken();
        
        // Créer une alarme pour revérifier après refresh
        chrome.alarms.create("recheckFeaturesAfterRefresh", {
          delayInMinutes: 0.05 // ~3 secondes
        });
        return;
      }
    }

    // Préparer les headers selon l'environnement
    const headers = isLocal
      ? {
          "X-Dev-User-Email": email || "dev@test.com",
          "X-Dev-User-ID": "dev-user",
        }
      : {
          Authorization: `Bearer ${token}`,
        };

    const res = await fetch(`${API_BASE}/check-subscription`, {
      headers,
    });

    if (!res.ok) {
      // Si token expiré (401), tenter rafraîchissement automatique
      if (res.status === 401) {
        currentRefreshCycleAttempts++;
        
        if (currentRefreshCycleAttempts > MAX_REFRESH_ATTEMPTS_PER_CYCLE) {
          console.error(`❌ [BACKGROUND] Max refresh attempts (${MAX_REFRESH_ATTEMPTS_PER_CYCLE}) atteints - arrêt pour éviter boucle infinie`);
          console.error("💡 Le token ne peut pas être rafraîchi. Déconnexion de l'utilisateur.");
          
          // Déconnecter complètement l'utilisateur - supprimer les tokens
          await chrome.storage.local.remove([
            "firebaseToken",
            "access_token",
            "access_token_stored_at",
            "user_email",
            "user_id"
          ]);
          
          // Désactiver les fonctionnalités
          await chrome.storage.local.set({
            mym_live_enabled: false,
            mym_badges_enabled: false,
            mym_stats_enabled: false,
            mym_emoji_enabled: false,
            mym_notes_enabled: false,
            subscription_active: false,
            trial_days_remaining: 0,
            agency_license_active: false
          });
          updateExtensionIcon("disconnected");
          
          // Réinitialiser le compteur pour permettre une nouvelle tentative après reconnexion
          currentRefreshCycleAttempts = 0;
          return;
        }
        
        console.warn(`🔒 [BACKGROUND] Token 401 (checkAndEnableFeatures) - tentative rafraîchissement (${currentRefreshCycleAttempts}/${MAX_REFRESH_ATTEMPTS_PER_CYCLE})`);
        await refreshFirebaseToken();
        
        // Créer une alarme pour revérifier après refresh
        chrome.alarms.create("recheckFeaturesAfterRefresh", {
          delayInMinutes: 0.05 // ~3 secondes
        });
      } else {
        if (APP_CONFIG.DEBUG) console.log(`⚠️ [BACKGROUND] Erreur API ${res.status} (checkAndEnableFeatures) - features conservées temporairement`);
      }
      return;
    }

    // Vérifier que la réponse est bien du JSON
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.warn(
        `⚠️ Réponse non-JSON reçue (${contentType}), probablement une erreur serveur`
      );
      return;
    }

    const data = await res.json();

    // ✅ Appel API réussi - réinitialiser le compteur de tentatives
    currentRefreshCycleAttempts = 0;

    // Si l'utilisateur a une licence agence active OU un abonnement actif, activer les fonctionnalités
    const hasAccess =
      data.agency_license_active === true || data.subscription_active === true || (data.trial_days_remaining && data.trial_days_remaining > 0);

    if (APP_CONFIG.DEBUG) console.log(`🔐 [BACKGROUND] Access check: hasAccess=${hasAccess}`);

    // Récupérer l'état actuel des features
    const currentState = await chrome.storage.local.get([
      'mym_live_enabled',
      'mym_badges_enabled',
      'mym_stats_enabled',
      'mym_emoji_enabled',
      'mym_notes_enabled'
    ]);

    // S'assurer que currentState est un objet valide
    const safeCurrentState = currentState || {};

    if (hasAccess) {
      // L'utilisateur a un accès valide - activer automatiquement toutes les fonctionnalités
      const allEnabled = {
        mym_live_enabled: true,
        mym_badges_enabled: true,
        mym_stats_enabled: true,
        mym_emoji_enabled: true,
        mym_notes_enabled: true,
        subscription_active: data.subscription_active || false,
        trial_days_remaining: data.trial_days_remaining || 0,
        agency_license_active: data.agency_license_active || false,
      };

      // Ne mettre à jour que si l'état a vraiment changé
      const needsUpdate = Object.keys(allEnabled).some(
        key => safeCurrentState[key] !== allEnabled[key]
      );

      if (needsUpdate) {
        await chrome.storage.local.set(allEnabled);
      }
      await updateExtensionIconBasedOnFeatures();
      if (APP_CONFIG.DEBUG) console.log("✅ [BACKGROUND] User has access, features enabled");
    } else {
      // Abonnement expiré - désactiver toutes les fonctionnalités
      console.log("⚠️ [BACKGROUND] Abonnement expiré - désactivation de toutes les fonctionnalités");
      // Aucune fonctionnalité disponible en mode gratuit
      await chrome.storage.local.set({
        mym_live_enabled: false,
        mym_badges_enabled: false,
        mym_stats_enabled: false,
        mym_emoji_enabled: false,
        mym_notes_enabled: false,
        subscription_active: false,
        trial_days_remaining: 0,
        agency_license_active: false,
      });
      await updateExtensionIconBasedOnFeatures();
    }
  } catch (err) {
    // En cas d'erreur réseau/serveur, GARDER les features actives
    // L'extension continue de fonctionner avec les paramètres actuels
    if (err.message && err.message.includes("Failed to fetch")) {
      console.log(
        "ℹ️  Backend temporairement indisponible - conservation des features actuelles"
      );
    } else {
      console.error(
        "❌ Erreur lors de la vérification de la licence:",
        err
      );
    }
  }
} // Vérifier la licence agence au changement de token/email
// ⚠️ DÉSACTIVÉ : Le storage listener créait une boucle infinie
// La vérification périodique via startSubscriptionCheck() suffit
// chrome.storage.onChanged.addListener(async (changes, areaName) => {
//   if (areaName === "local") {
//     const credentialChanged = changes.firebaseToken || changes.user_email;
//     if (credentialChanged) {
//       await checkAndEnableFeatures();
//     }
//   }
// });

// Lancer les vérifications au démarrage de l'extension
startSubscriptionCheck();
// ℹ️ checkAndEnableFeatures() sera appelé par le storage listener si des credentials existent

// 🎨 Listener unifié : surveille tokens ET features pour mettre à jour l'icône et l'état
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    // Vérifier si les tokens Firebase ou access_token ont changé
    if (changes.firebaseToken || changes.access_token) {
      const hasFirebaseToken = changes.firebaseToken?.newValue;
      const hasAccessToken = changes.access_token?.newValue;

      if (hasFirebaseToken || hasAccessToken) {
        // Token ajouté = connexion → vérifier abonnement
        if (APP_CONFIG.DEBUG) console.log("🔄 Token détecté, vérification de l'abonnement...");
        checkAndEnableFeatures();
      } else {
        // Token supprimé = déconnexion
        updateExtensionIcon("disconnected");
      }
    }
    
    // Détecter si des fonctionnalités ont changé
    const featureKeys = [
      "mym_live_enabled",
      "mym_badges_enabled",
      "mym_stats_enabled",
      "mym_emoji_enabled",
      "mym_notes_enabled"
    ];

    const featureChanged = featureKeys.some(key => changes[key]);

    if (featureChanged) {
      // Mettre à jour l'icône selon l'état réel des features
      if (APP_CONFIG.DEBUG) console.log("🔄 Feature state changed, updating icon...");
      updateExtensionIconBasedOnFeatures();
    }
  }
});

// Vérifier aussi quand le service worker se réveille
self.addEventListener("activate", () => {
  if (APP_CONFIG.DEBUG) console.log("🔄 Service worker activé - vérification de la licence...");
  checkAndEnableFeatures();
});

// ℹ️ Vérification initiale au startup (une seule fois)
// Si credentials existent, checkAndEnableFeatures() sera automatiquement appelé
chrome.storage.local.get(["firebaseToken", "access_token"], (data) => {
  const safeData = data || {};
  if (safeData.firebaseToken || safeData.access_token) {
    if (APP_CONFIG.DEBUG) console.log("🔄 Credentials found at startup, checking features...");
    checkAndEnableFeatures();
  } else {
    if (APP_CONFIG.DEBUG) console.log("ℹ️ No credentials at startup");
  }
});

// Créer une alarme pour vérifier périodiquement la licence
const licenseCheckInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.LICENSE_CHECK_INTERVAL_MIN) ||
  5; // 5 minutes pour des tests rapides
if (APP_CONFIG.DEBUG) console.log(`⏰ [BACKGROUND] License check alarm: every ${licenseCheckInterval} minutes`);
chrome.alarms.create("checkLicenseAlarm", {
  periodInMinutes: licenseCheckInterval,
});

// Créer une alarme pour rafraîchir le token Firebase
const tokenRefreshInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.TOKEN_REFRESH_INTERVAL_MIN) ||
  5; // 5 minutes pour des tests rapides
if (APP_CONFIG.DEBUG) console.log(`⏰ [BACKGROUND] Token refresh alarm: every ${tokenRefreshInterval} minutes`);
chrome.alarms.create("refreshTokenAlarm", {
  periodInMinutes: tokenRefreshInterval,
});

// Rafraîchir le token immédiatement au démarrage
chrome.alarms.create("initialTokenRefresh", {
  delayInMinutes: 0.1, // 6 secondes (minimum supporté par Chrome)
});

// Écouter l'alarme
chrome.alarms.onAlarm.addListener((alarm) => {
  if (APP_CONFIG.DEBUG) console.log(`⏰ [BACKGROUND] Alarm triggered: ${alarm.name}`);
  if (alarm.name === "checkLicenseAlarm") {
    if (APP_CONFIG.DEBUG) console.log("🔍 [BACKGROUND] Running checkAndEnableFeatures from alarm...");
    checkAndEnableFeatures();
  } else if (alarm.name === "refreshTokenAlarm") {
    if (APP_CONFIG.DEBUG) console.log("🔄 [BACKGROUND] Running refreshFirebaseToken from alarm...");
    refreshFirebaseToken();
  } else if (alarm.name === "checkSubscriptionAlarm") {
    if (APP_CONFIG.DEBUG) console.log("🔍 [BACKGROUND] Running checkSubscriptionStatus from alarm...");
    checkSubscriptionStatus();
  } else if (alarm.name === "initialSubscriptionCheck") {
    if (APP_CONFIG.DEBUG) console.log("🔍 [BACKGROUND] Initial subscription check...");
    checkSubscriptionStatus();
  } else if (alarm.name === "initialTokenRefresh") {
    if (APP_CONFIG.DEBUG) console.log("🔄 [BACKGROUND] Initial token refresh on startup");
    refreshFirebaseToken();
  } else if (alarm.name === "recheckAfterTokenRefresh") {
    // Vérifier si le token a été rafraîchi après expiration
    chrome.storage.local.get(["firebaseToken"], (newData) => {
      if (newData?.firebaseToken && !isTokenExpiringSoon(newData.firebaseToken, 0)) {
        console.log("✅ [BACKGROUND] Token rafraîchi après expiration - revérification");
        checkSubscriptionStatus(true);
      } else {
        console.log("⚠️ [BACKGROUND] Token expiré - mode gratuit activé");
        chrome.storage.local.set({ subscription_active: false });
        updateExtensionIcon("error");
      }
    });
  } else if (alarm.name === "recheckFeaturesAfterRefresh") {
    // Revérifier les features après tentative de refresh
    chrome.storage.local.get(["firebaseToken", "access_token"], (newData) => {
      const token = newData?.firebaseToken || newData?.access_token;
      
      if (token) {
        // Vérifier si le token est valide (non expiré)
        if (!isTokenExpiringSoon(token, 0)) {
          if (APP_CONFIG.DEBUG) console.log("✅ [BACKGROUND] Token valide trouvé - revérification des features");
          checkAndEnableFeatures();
        } else {
          console.warn("⚠️ [BACKGROUND] Token encore expiré après tentative refresh - revérification");
          checkAndEnableFeatures(); // Tenter quand même, le compteur de retry arrêtera si échec
        }
      } else {
        console.warn("⚠️ [BACKGROUND] Aucun token trouvé après tentative refresh");
        chrome.storage.local.set({ 
          subscription_active: false,
          mym_live_enabled: false,
          mym_badges_enabled: false,
          mym_stats_enabled: false,
          mym_emoji_enabled: false,
          mym_notes_enabled: false
        });
        updateExtensionIcon("disconnected");
      }
    });
  } else if (alarm.name.startsWith("cleanupTab_")) {
    const tabId = parseInt(alarm.name.replace("cleanupTab_", ""));
    chrome.tabs.remove(tabId, () => {
      if (!chrome.runtime.lastError) {
        if (APP_CONFIG.DEBUG) console.log(`🧹 Cleaned up stale tab ${tabId}`);
      }
    });
  } else if (alarm.name.startsWith("closeTab_")) {
    const tabId = parseInt(alarm.name.replace("closeTab_", ""));
    chrome.tabs.remove(tabId, () => {
      if (!chrome.runtime.lastError) {
        if (APP_CONFIG.DEBUG) console.log(`✅ Background tab ${tabId} closed after token refresh`);
      }
    });
  }
});

/**
 * Check if JWT token is expired or will expire soon
 */
function isTokenExpiringSoon(token, minutesBeforeExpiry = 10) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const decoded = JSON.parse(jsonPayload);
    
    const expiresAt = decoded.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 1000 / 60);
    
    if (APP_CONFIG.DEBUG) console.log(`🕐 [BACKGROUND] Token expires in ${minutesUntilExpiry} minutes`);
    
    return minutesUntilExpiry < minutesBeforeExpiry;
  } catch (error) {
    console.warn("⚠️ [BACKGROUND] Error checking token expiry:", error);
    return true; // If can't decode, assume expired
  }
}

// Variable pour éviter les refresh trop fréquents
let lastRefreshAttempt = 0;
const REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 minutes minimum entre chaque refresh

// Compteur pour éviter les boucles infinies de refresh
let currentRefreshCycleAttempts = 0;
const MAX_REFRESH_ATTEMPTS_PER_CYCLE = 2;

// 🔄 Rafraîchir le token Firebase de manière proactive via l'API backend
async function refreshFirebaseToken() {
  if (APP_CONFIG.DEBUG) console.log("🔄 [BACKGROUND] refreshFirebaseToken called");
  
  // Vérifier le cooldown
  const now = Date.now();
  if (now - lastRefreshAttempt < REFRESH_COOLDOWN) {
    const remainingSeconds = Math.round((REFRESH_COOLDOWN - (now - lastRefreshAttempt)) / 1000);
    if (APP_CONFIG.DEBUG || remainingSeconds > 10) {
      console.log(`ℹ️ Refresh en cooldown (${remainingSeconds}s restantes)`);
    }
    return;
  }
  
  // Nouveau cycle de refresh - réinitialiser le compteur
  if (now - lastRefreshAttempt >= REFRESH_COOLDOWN) {
    currentRefreshCycleAttempts = 0;
  }
  
  lastRefreshAttempt = now;
  
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["firebaseToken", "user_email", "access_token"], resolve);
    });

    const safeData = data || {};
    const token = safeData.firebaseToken || safeData.access_token;
    
    if (!token || !safeData.user_email) {
      if (APP_CONFIG.DEBUG) console.log("ℹ️ Pas de token Firebase à rafraîchir (pas connecté)");
      return;
    }

    // Vérifier si le token expire bientôt (15 minutes avant expiration)
    if (!isTokenExpiringSoon(token, 15)) {
      if (APP_CONFIG.DEBUG) console.log("✅ Token encore valide pour plus de 15 minutes, pas besoin de rafraîchir maintenant");
      return;
    }

    if (APP_CONFIG.DEBUG) console.log("🔄 Rafraîchissement du token Firebase via API backend...");

    // Appeler l'API backend pour rafraîchir le token
    const response = await fetch(`${API_BASE}/refresh-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Échec du refresh token (HTTP ${response.status})`);
      return;
    }

    const refreshData = await response.json();
    
    if (!refreshData.custom_token || !refreshData.api_key) {
      console.error("❌ Réponse invalide du serveur (custom_token ou api_key manquant)");
      return;
    }

    // Échanger le custom token contre un ID token via l'API Firebase
    const exchangeResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${refreshData.api_key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: refreshData.custom_token,
          returnSecureToken: true,
        }),
      }
    );

    if (!exchangeResponse.ok) {
      console.error("❌ Échec de l'échange du custom token");
      return;
    }

    const exchangeData = await exchangeResponse.json();
    
    if (!exchangeData.idToken) {
      console.error("❌ Pas de idToken dans la réponse d'échange");
      return;
    }

    // Stocker le nouveau token
    await chrome.storage.local.set({
      firebaseToken: exchangeData.idToken,
      access_token_stored_at: Date.now(),
    });

    if (APP_CONFIG.DEBUG) console.log("✅ Token Firebase rafraîchi avec succès via API backend");
    
    // Revérifier les features après le refresh
    await checkAndEnableFeatures();

  } catch (error) {
    console.error("❌ Erreur lors du rafraîchissement du token:", error);
  }
}

// 🗑️ Ancienne méthode avec content script (conservée en fallback mais non utilisée)
async function refreshFirebaseTokenViaContentScript() {
  try {
    // Envoyer un message aux content scripts pour déclencher le rafraîchissement
    chrome.tabs.query({ url: "https://creators.mym.fans/*" }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.warn("⚠️ Tab query error:", chrome.runtime.lastError.message);
        return;
      }
      
      if (tabs && tabs.length > 0) {
        // On a déjà un onglet ouvert sur creators.mym.fans
        chrome.tabs.get(tabs[0].id, (tab) => {
          if (!chrome.runtime.lastError && tab) {
            if (APP_CONFIG.DEBUG) console.log("✅ Envoi de REFRESH_FIREBASE_TOKEN à l'onglet existant");
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "REFRESH_FIREBASE_TOKEN",
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn("⚠️ Error sending refresh message:", chrome.runtime.lastError.message);
              } else {
                if (APP_CONFIG.DEBUG) console.log("✅ Token refresh message sent successfully");
              }
            });
          }
        });
      } else {
        // Pas d'onglet ouvert, on ouvre silencieusement la page pour rafraîchir le token
        console.log("ℹ️ Aucun onglet creators.mym.fans ouvert, ouverture d'un nouvel onglet pour refresh");
        chrome.tabs.create({
          url: "https://creators.mym.fans/app/myms",
          active: false // Ouvrir en arrière-plan
        }, (newTab) => {
          if (!newTab || !newTab.id) return;
          
          // Utiliser chrome.tabs.onUpdated pour détecter quand la page est chargée
          const tabId = newTab.id;
          let listenerCleaned = false;
          
          const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              if (listenerCleaned) return;
              listenerCleaned = true;
              chrome.tabs.onUpdated.removeListener(listener);
              
              chrome.tabs.sendMessage(tabId, {
                type: "REFRESH_FIREBASE_TOKEN",
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn("⚠️ Error sending refresh message to new tab:", chrome.runtime.lastError.message);
                } else {
                  if (APP_CONFIG.DEBUG) console.log("✅ Token refresh message sent to new tab");
                }
                
                // Créer une alarme pour fermer l'onglet après 5 secondes
                chrome.alarms.create(`closeTab_${tabId}`, {
                  delayInMinutes: 0.1, // ~6 secondes (minimum)
                });
              });
            }
          };
          
          chrome.tabs.onUpdated.addListener(listener);
          
          // Timeout de sécurité - si l'onglet ne se charge pas en 30 secondes, nettoyer
          chrome.alarms.create(`cleanupTab_${tabId}`, {
            delayInMinutes: 0.5, // 30 secondes
          });
        });
      }
    });
  } catch (err) {
    console.error("❌ Erreur lors du rafraîchissement du token:", err);
  }
}

// ✅ Storage listener unifié déjà défini plus haut (ligne ~927)
// Ce listener gère à la fois les changements de tokens ET de features
