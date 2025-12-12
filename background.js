// background.js - Initialize default values on extension install

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

// console.log("🚀 [BACKGROUND] Script starting...");
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
  // console.log("🔍 [BACKGROUND] APP_CONFIG value:", globalThis.APP_CONFIG);
} catch (e) {
  console.error("❌ [BACKGROUND] Error checking APP_CONFIG:", e);
}

const API_BASE =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.API_BASE) ||
  "https://mymchat.fr/api";
const TOKEN_MAX_AGE =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.TOKEN_MAX_AGE) ||
  365 * 24 * 60 * 60 * 1000;
// console.log(`🔧 [BACKGROUND] Loaded with API_BASE: ${API_BASE}`);
// console.log(
//   `🔧 [BACKGROUND] TOKEN_MAX_AGE: ${
//     TOKEN_MAX_AGE / (24 * 60 * 60 * 1000)
//   } jours`
// );
// console.log("✅ [BACKGROUND] Initialization complete");

// 🎨 Fonction pour mettre à jour l'icône de l'extension selon le statut
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
            // console.log(`🎨 [BACKGROUND] Icon updated to: ${status}`);
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

// 🔄 Vérifier le statut de connexion au démarrage
function checkConnectionStatus() {
  chrome.storage.local.get(
    ["firebaseToken", "access_token", "user_email"],
    (data) => {
      const safeData = data || {};
      if (safeData.firebaseToken || safeData.access_token) {
        updateExtensionIcon("connected");
      } else {
        updateExtensionIcon("disconnected");
      }
    }
  );
}

// ⚠️ NE PAS appeler checkConnectionStatus() au démarrage
// L'icône sera mise à jour par checkAndEnableFeatures() après vérification de l'abonnement

// Icône par défaut au démarrage (sera mise à jour par checkAndEnableFeatures)
updateExtensionIcon("disconnected");

// 🌉 Écouter les messages du auth-bridge (connexion Google depuis le site web)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 🔓 Message pour vérifier la licence agence
  if (message.action === "checkLicense") {
    // console.log("📨 Message reçu: vérification de la licence demandée");

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
    // console.log("✅ Background: Received Firebase token from web");

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
    // console.log("🔍 Background: Validating Firebase token...");

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
        // console.log("✅ Background: Token validé avec succès");

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
        // // console.log("✅ Background: Token stored and features enabled");
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
  // console.log("🚀 [BACKGROUND] Browser startup - reinitializing alarms");
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
    // console.log("⏭️ [BACKGROUND] Subscription check skipped (cooldown)");
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
        // console.log("ℹ️  Pas de token - utilisateur non connecté");
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
                // console.log("🚫 [BACKGROUND] Token JWT expiré - tentative de rafraîchissement");
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
            // console.log("🔒 [BACKGROUND] Token 401 - vérification abonnement par email...");
            
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
                    // console.log("✅ [BACKGROUND] Abonnement valide via email - conservation des fonctionnalités");
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
            // console.log("🔄 [BACKGROUND] Tentative rafraîchissement token...");
            await refreshFirebaseToken();
            
            // Créer une alarme pour revérifier
            chrome.alarms.create("recheckAfterTokenRefresh", {
              delayInMinutes: 0.05 // ~3 secondes
            });
          } else {
            // Pour les autres erreurs (500, 503, etc.), on GARDE les features actives
            // console.log(`⚠️ [BACKGROUND] Erreur API ${res.status} - features conservées temporairement`);
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
  // console.log(`🚫 [BACKGROUND] disableAllFeatures called with icon: ${iconState}, bypass: ${bypassManualCheck}`);
  
  // Prévenir les boucles infinies
  if (isDisablingFeatures) {
    // console.log("⏭️ [BACKGROUND] Already disabling features, skipping...");
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
          // console.log("⏸️ [BACKGROUND] Ignoring disableAllFeatures - user just toggled manually (protection)");
          updateExtensionIcon(iconState);
          return;
        }
      }
      
      // console.log("📊 [BACKGROUND] Current features state:", safeState);
      const wasAnyEnabled = Object.values(safeState).some(
        (val) => val === true
      );
      // console.log(`📊 [BACKGROUND] Any feature was enabled: ${wasAnyEnabled}`);

      chrome.storage.local.set(
        {
          mym_live_enabled: false,
          mym_badges_enabled: false,
          mym_stats_enabled: false,
          mym_emoji_enabled: false,
          mym_notes_enabled: false,
        },
        () => {
          // console.log("🚫 Toutes les fonctionnalités désactivées");
          updateExtensionIcon(iconState);
          
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
      "https://mymchat.fr/api";
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
      console.log("ℹ️ Pas de token - désactivation de toutes les fonctionnalités");
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
        console.warn(
          `⚠️ [BACKGROUND] Token expiré (âge: ${Math.floor(
            tokenAge / (24 * 60 * 60 * 1000)
          )} jours) - tentative rafraîchissement`
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
        console.warn("🔒 [BACKGROUND] Token 401 (checkAndEnableFeatures) - tentative rafraîchissement");
        await refreshFirebaseToken();
        
        // Créer une alarme pour revérifier après refresh
        chrome.alarms.create("recheckFeaturesAfterRefresh", {
          delayInMinutes: 0.05 // ~3 secondes
        });
      } else {
        // console.log(`⚠️ [BACKGROUND] Erreur API ${res.status} (checkAndEnableFeatures) - features conservées temporairement`);
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

    // Si l'utilisateur a une licence agence active OU un abonnement actif, activer les fonctionnalités
    const hasAccess =
      data.agency_license_active === true || data.subscription_active === true || (data.trial_days_remaining && data.trial_days_remaining > 0);

    // console.log(`🔐 [BACKGROUND] Access check: hasAccess=${hasAccess}`);

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
      };

      // Ne mettre à jour que si l'état a vraiment changé
      const needsUpdate = Object.keys(allEnabled).some(
        key => safeCurrentState[key] !== allEnabled[key]
      );

      if (needsUpdate) {
        await chrome.storage.local.set(allEnabled);
      }
      updateExtensionIcon("connected");
      // console.log("✅ [BACKGROUND] User has access, features enabled");
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
        subscription_active: false
      });
      updateExtensionIcon("error");
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
checkAndEnableFeatures();

// 🎨 Surveiller les changements d'état des fonctionnalités pour mettre à jour l'icône
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
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
      // Vérifier l'état actuel de toutes les features
      chrome.storage.local.get(featureKeys, (data) => {
        // S'assurer que data est un objet valide
        const safeData = data || {};
        const anyEnabled = Object.values(safeData).some(val => val === true);
        
        if (anyEnabled) {
          // Au moins une fonctionnalité active → icône verte
          updateExtensionIcon("connected");
        } else {
          // Aucune fonctionnalité active → vérifier si token existe
          chrome.storage.local.get(["firebaseToken", "access_token"], (tokens) => {
            const safeTokens = tokens || {};
            if (safeTokens.firebaseToken || safeTokens.access_token) {
              // Token existe mais features désactivées → icône rouge (abonnement expiré)
              updateExtensionIcon("error");
            } else {
              // Pas de token → icône grise (déconnecté)
              updateExtensionIcon("disconnected");
            }
          });
        }
      });
    }
  }
});

// Vérifier aussi quand le service worker se réveille
self.addEventListener("activate", () => {
  // console.log("🔄 Service worker activé - vérification de la licence...");
  checkAndEnableFeatures();
});

// Vérifier immédiatement si déjà des credentials en storage
chrome.storage.local.get(["firebaseToken", "user_email"], (data) => {
  const safeData = data || {};
  if (safeData.firebaseToken || safeData.user_email) {
    checkAndEnableFeatures();
  }
});

// Créer une alarme pour vérifier périodiquement la licence
const licenseCheckInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.LICENSE_CHECK_INTERVAL_MIN) ||
  5; // 5 minutes pour des tests rapides
// console.log(`⏰ [BACKGROUND] License check alarm: every ${licenseCheckInterval} minutes`);
chrome.alarms.create("checkLicenseAlarm", {
  periodInMinutes: licenseCheckInterval,
});

// Créer une alarme pour rafraîchir le token Firebase
const tokenRefreshInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.TOKEN_REFRESH_INTERVAL_MIN) ||
  5; // 5 minutes pour des tests rapides
// console.log(`⏰ [BACKGROUND] Token refresh alarm: every ${tokenRefreshInterval} minutes`);
chrome.alarms.create("refreshTokenAlarm", {
  periodInMinutes: tokenRefreshInterval,
});

// Rafraîchir le token immédiatement au démarrage
chrome.alarms.create("initialTokenRefresh", {
  delayInMinutes: 0.1, // 6 secondes (minimum supporté par Chrome)
});

// Écouter l'alarme
chrome.alarms.onAlarm.addListener((alarm) => {
  // console.log(`⏰ [BACKGROUND] Alarm triggered: ${alarm.name}`);
  if (alarm.name === "checkLicenseAlarm") {
    // console.log("🔍 [BACKGROUND] Running checkAndEnableFeatures from alarm...");
    checkAndEnableFeatures();
  } else if (alarm.name === "refreshTokenAlarm") {
    // console.log("🔄 [BACKGROUND] Running refreshFirebaseToken from alarm...");
    refreshFirebaseToken();
  } else if (alarm.name === "checkSubscriptionAlarm") {
    // console.log("🔍 [BACKGROUND] Running checkSubscriptionStatus from alarm...");
    checkSubscriptionStatus();
  } else if (alarm.name === "initialSubscriptionCheck") {
    // console.log("🔍 [BACKGROUND] Initial subscription check...");
    checkSubscriptionStatus();
  } else if (alarm.name === "initialTokenRefresh") {
    // console.log("🔄 [BACKGROUND] Initial token refresh on startup");
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
    chrome.storage.local.get(["firebaseToken"], (newData) => {
      if (newData?.firebaseToken) {
        console.log("✅ [BACKGROUND] Token rafraîchi - revérification des features");
        checkAndEnableFeatures();
      } else {
        console.log("⚠️ [BACKGROUND] Token expiré - mode gratuit activé");
        chrome.storage.local.set({ subscription_active: false });
        updateExtensionIcon("error");
      }
    });
  } else if (alarm.name.startsWith("cleanupTab_")) {
    const tabId = parseInt(alarm.name.replace("cleanupTab_", ""));
    chrome.tabs.remove(tabId, () => {
      if (!chrome.runtime.lastError) {
        // console.log(`🧹 Cleaned up stale tab ${tabId}`);
      }
    });
  } else if (alarm.name.startsWith("closeTab_")) {
    const tabId = parseInt(alarm.name.replace("closeTab_", ""));
    chrome.tabs.remove(tabId, () => {
      if (!chrome.runtime.lastError) {
        // console.log(`✅ Background tab ${tabId} closed after token refresh`);
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
    
    // console.log(`🕐 [BACKGROUND] Token expires in ${minutesUntilExpiry} minutes`);
    
    return minutesUntilExpiry < minutesBeforeExpiry;
  } catch (error) {
    console.warn("⚠️ [BACKGROUND] Error checking token expiry:", error);
    return true; // If can't decode, assume expired
  }
}

// Variable pour éviter les refresh trop fréquents
let lastRefreshAttempt = 0;
const REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 minutes minimum entre chaque refresh

// 🔄 Rafraîchir le token Firebase de manière proactive
async function refreshFirebaseToken() {
  // console.log("🔄 [BACKGROUND] refreshFirebaseToken called");
  
  // Vérifier le cooldown
  const now = Date.now();
  if (now - lastRefreshAttempt < REFRESH_COOLDOWN) {
    console.log(`ℹ️ Refresh en cooldown (${Math.round((REFRESH_COOLDOWN - (now - lastRefreshAttempt)) / 1000)}s restantes)`);
    return;
  }
  
  lastRefreshAttempt = now;
  
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["firebaseToken", "user_email", "access_token"], resolve);
    });

    const safeData = data || {};
    const token = safeData.firebaseToken || safeData.access_token;
    
    if (!token || !safeData.user_email) {
      console.log("ℹ️ Pas de token Firebase à rafraîchir (pas connecté)");
      return;
    }

    // Vérifier si le token expire bientôt
    if (!isTokenExpiringSoon(token, 10)) {
      // console.log("✅ Token encore valide, pas besoin de rafraîchir maintenant");
      return;
    }

    // console.log("🔄 Rafraîchissement automatique du token Firebase...");

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
            // console.log("✅ Envoi de REFRESH_FIREBASE_TOKEN à l'onglet existant");
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "REFRESH_FIREBASE_TOKEN",
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn("⚠️ Error sending refresh message:", chrome.runtime.lastError.message);
              } else {
                // console.log("✅ Token refresh message sent successfully");
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
                  // console.log("✅ Token refresh message sent to new tab");
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

// 🎨 Écouter les changements de stockage pour mettre à jour l'icône en temps réel
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    // Vérifier si les tokens Firebase ou access_token ont changé
    if (changes.firebaseToken || changes.access_token) {
      const hasFirebaseToken = changes.firebaseToken?.newValue;
      const hasAccessToken = changes.access_token?.newValue;

      if (hasFirebaseToken || hasAccessToken) {
        // Ne pas mettre l'icône à "connected" directement
        // Vérifier d'abord l'abonnement
        // console.log("🔄 Token détecté, vérification de l'abonnement...");
        checkAndEnableFeatures();
      } else {
        // Token supprimé = déconnexion
        updateExtensionIcon("disconnected");
      }
    }
  }
});
