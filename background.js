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

    // ⚠️ Vérifier IMMÉDIATEMENT l'abonnement avant d'activer les features
    checkSubscriptionStatusSync().then((isValid) => {
      if (!isValid) {
        console.warn(
          "⚠️ Abonnement inactif - accès refusé aux fonctionnalités"
        );
        // Ne pas désactiver complètement, juste refuser l'activation des features
        sendResponse({ success: false, reason: "subscription_inactive" });
        return;
      }

      // Si l'abonnement est valide, procéder avec l'activation des features
      checkAndEnableFeatures().then(() => {
        sendResponse({ success: true });
      });
    });

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

    // Stocker le token dans chrome.storage ET activer toutes les features
    chrome.storage.local.set(
      {
        access_token: message.data.access_token,
        user_email: message.data.user_email,
        user_id: message.data.user_id,
        access_token_stored_at: message.data.access_token_stored_at,
        // Activer toutes les fonctionnalités par défaut
        mym_live_enabled: true,
        mym_badges_enabled: true,
        mym_stats_enabled: true,
        mym_emoji_enabled: true,
        mym_notes_enabled: true,
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
  const interval =
    (globalThis.APP_CONFIG &&
      globalThis.APP_CONFIG.SUBSCRIPTION_CHECK_INTERVAL) ||
    30 * 60 * 1000; // Fallback: 30 minutes
  
  // console.log(`⏰ [BACKGROUND] Subscription check interval: ${interval / 1000 / 60} minutes`);
  
  // Vérifier après 5 secondes (laisser le temps au storage de se charger)
  setTimeout(() => checkSubscriptionStatus(), 5000);

  // Puis vérifier selon l'intervalle configuré
  setInterval(() => checkSubscriptionStatus(), interval);
}

// Debounce pour éviter les appels multiples rapprochés
let lastCheckTime = 0;
const CHECK_COOLDOWN = 5000; // 5 secondes minimum entre deux vérifications

async function checkSubscriptionStatus(force = false) {
  const now = Date.now();
  
  // Ignorer si déjà vérifié il y a moins de 5 secondes (sauf si force=true)
  if (!force && (now - lastCheckTime) < CHECK_COOLDOWN) {
    console.log("⏭️ [BACKGROUND] Subscription check skipped (cooldown)");
    return;
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

      // Si token trop vieux (365 jours), NE PAS désactiver, juste logger
      // L'utilisateur devra se reconnecter mais on ne supprime rien
      if (token && ageMs > ninetyDays) {
        // // console.log("⚠️  Token expiré (>365 jours) - veuillez vous reconnecter");
        // Ne pas désactiver les features, juste informer
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
            // Token invalide ou expiré - SEUL CAS où on désactive
            disableAllFeatures("error");
            chrome.storage.local.remove([
              "access_token",
              "access_token_stored_at",
              "user_email",
              "firebaseToken",
              "user_id",
            ]);
          }
          // Pour les autres erreurs (500, 503, etc.), on GARDE les features actives
          // L'utilisateur peut continuer à utiliser l'extension
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
          // // console.log("⚠️  Email non vérifié - désactivation des features");
          disableAllFeatures("error"); // Icône rouge pour email non vérifié

          // Informer l'utilisateur
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Email non vérifié",
            message:
              "Veuillez vérifier votre adresse email pour utiliser l'extension. Consultez votre profil sur le site.",
            priority: 2,
          });

          return;
        }

        // Vérifier si l'abonnement est actif OU période d'essai valide
        if (result.subscription_active || result.trial_days_remaining > 0) {
          // console.log("✅ Abonnement actif - activation des fonctionnalités");
          // Activer toutes les fonctionnalités
          chrome.storage.local.set({
            mym_live_enabled: true,
            mym_badges_enabled: true,
            mym_stats_enabled: true,
            mym_emoji_enabled: true,
            mym_notes_enabled: true,
          }, () => {
            // Icône verte uniquement APRÈS activation des features
            updateExtensionIcon("connected");
          });
        } else {
          // Abonnement expiré mais token valide : désactiver les features
          disableAllFeatures("error");
          // NE PAS supprimer les credentials - l'utilisateur reste connecté
        }
      } catch (err) {
        console.error("❌ Erreur vérification statut:", err);
        // En cas d'erreur réseau/serveur, on GARDE les features actives
        // L'utilisateur peut continuer à utiliser l'extension
      }
    } // Fin du callback async chrome.storage.local.get
  ); // Fin de chrome.storage.local.get
} // Fin de checkSubscriptionStatus

// Version synchrone pour vérification immédiate (retourne une Promise)
async function checkSubscriptionStatusSync() {
  // console.log("🔍 [BACKGROUND] checkSubscriptionStatusSync called");
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["access_token", "firebaseToken", "user_email"],
      async (data) => {
        const safeData = data || {};
        const token = safeData.firebaseToken || safeData.access_token;
        const email = safeData.user_email;

        if (!token && !email) {
          console.warn("⚠️ [BACKGROUND] No token or email found");
          resolve(false);
          return;
        }

        try {
          const isLocal =
            (globalThis.APP_CONFIG && globalThis.APP_CONFIG.ENVIRONMENT) ===
            "local";

          const headers = isLocal
            ? {
                "X-Dev-User-Email": email || "dev@test.com",
                "X-Dev-User-ID": "dev-user",
              }
            : { Authorization: `Bearer ${token}` };

          // console.log(`🔍 [BACKGROUND] Calling ${API_BASE}/check-subscription`);
          const res = await fetch(API_BASE + "/check-subscription", {
            headers,
          });

          if (!res.ok) {
            if (res.status === 401) {
              // Token invalide - SEUL CAS où on désactive
              disableAllFeatures("error");
              chrome.storage.local.remove([
                "access_token",
                "access_token_stored_at",
                "user_email",
                "firebaseToken",
                "user_id",
              ]);
              resolve(false);
            } else {
              // Erreur serveur (500, 503, etc.) - GARDER les features actives
              resolve(true); // Retourner true pour ne pas bloquer l'utilisateur
            }
            return;
          }

          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            resolve(false);
            return;
          }

          const result = await res.json();

          if (result.email_verified === false) {
            console.warn("⚠️ Email non vérifié");
            disableAllFeatures("error"); // Icône rouge pour email non vérifié
            resolve(false);
            return;
          }

          if (result.subscription_active || result.trial_days_remaining > 0 || result.agency_license_active) {
            // console.log("✅ Accès accordé (subscription, trial ou agency)");
            resolve(true);
          } else {
            // Abonnement expiré : désactiver les features mais GARDER la connexion
            console.warn("⚠️ Aucun accès actif détecté");
            disableAllFeatures("error"); // Icône rouge pour abonnement expiré
            // ⚠️ NE PAS supprimer les credentials - l'utilisateur reste connecté
            resolve(false);
          }
        } catch (err) {
          console.error("❌ Erreur vérification statut sync:", err);
          // En cas d'erreur réseau, retourner true pour GARDER les features actives
          resolve(true);
        }
      }
    );
  });
}

function disableAllFeatures(iconState = "disconnected") {
  // console.log("🚫 [BACKGROUND] disableAllFeatures called with icon:", iconState);
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
      
      // 🚫 NOUVEAU: Ne pas désactiver si l'utilisateur vient de toggle manuellement (< 2 secondes)
      const manualToggleTimestamp = safeState.user_manual_toggle_timestamp || 0;
      const timeSinceManualToggle = Date.now() - manualToggleTimestamp;
      
      if (timeSinceManualToggle < 2000) {
        console.log("⏸️ [BACKGROUND] Ignoring disableAllFeatures - user just toggled manually");
        updateExtensionIcon(iconState);
        return;
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

    if (!token && !email) {
      // console.log("ℹ️ Pas de token ni d'email - utilisateur non connecté");
      return;
    }

    // Vérifier l'âge du token
    if (tokenStoredAt) {
      const tokenAge = Date.now() - tokenStoredAt;
      if (tokenAge > TOKEN_MAX_AGE) {
        console.warn(
          `⚠️ Token expiré (âge: ${Math.floor(
            tokenAge / (24 * 60 * 60 * 1000)
          )} jours) - nettoyage`
        );
        await chrome.storage.local.remove([
          "firebaseToken",
          "access_token",
          "access_token_stored_at",
          "user_id",
          "user_email",
        ]);

        // Désactiver toutes les fonctionnalités
        const allDisabled = {
          mym_live_enabled: false,
          mym_badges_enabled: false,
          mym_stats_enabled: false,
          mym_emoji_enabled: false,
          mym_notes_enabled: false,
        };
        await chrome.storage.local.set(allDisabled);
        updateExtensionIcon("error"); // Icône rouge pour token expiré
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
      // Si token expiré (401), déconnecter l'utilisateur
      if (res.status === 401) {
        console.warn("🔒 Token expiré - nettoyage des credentials");
        await chrome.storage.local.remove([
          "access_token",
          "access_token_stored_at",
          "user_id",
          "user_email",
          "firebaseToken",
        ]);

        // Désactiver toutes les fonctionnalités
        const allDisabled = {
          mym_live_enabled: false,
          mym_badges_enabled: false,
          mym_stats_enabled: false,
          mym_emoji_enabled: false,
          mym_notes_enabled: false,
        };
        await chrome.storage.local.set(allDisabled);
        updateExtensionIcon("error");
      }
      // Pour les autres erreurs (500, 503, etc.), GARDER les features actives
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
        updateExtensionIcon("connected");
        // console.log("✅ [BACKGROUND] Features enabled, icon set to connected");
      } else {
        // console.log("ℹ️ [BACKGROUND] Features already enabled, no update needed");
      }
    } else {
      // console.log("🚫 [BACKGROUND] No active access - disabling features");

      const allDisabled = {
        mym_live_enabled: false,
        mym_badges_enabled: false,
        mym_stats_enabled: false,
        mym_emoji_enabled: false,
        mym_notes_enabled: false,
      };

      // Ne mettre à jour que si l'état a vraiment changé
      const needsUpdate = Object.keys(allDisabled).some(
        key => safeCurrentState[key] !== allDisabled[key]
      );

      if (needsUpdate) {
        await chrome.storage.local.set(allDisabled);
        updateExtensionIcon("error"); // Icône rouge pour abonnement expiré
        // console.log("🚫 [BACKGROUND] Features disabled, icon set to error");
      } else {
        // console.log("ℹ️ [BACKGROUND] Features already disabled, no update needed");
      }
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
  30;
// console.log(`⏰ [BACKGROUND] License check alarm: every ${licenseCheckInterval} minutes`);
chrome.alarms.create("checkLicenseAlarm", {
  periodInMinutes: licenseCheckInterval,
});

// Créer une alarme pour rafraîchir le token Firebase
const tokenRefreshInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.TOKEN_REFRESH_INTERVAL_MIN) ||
  50;
// console.log(`⏰ [BACKGROUND] Token refresh alarm: every ${tokenRefreshInterval} minutes`);
chrome.alarms.create("refreshTokenAlarm", {
  periodInMinutes: tokenRefreshInterval,
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
  }
});

// 🔄 Rafraîchir le token Firebase de manière proactive
async function refreshFirebaseToken() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["firebaseToken", "user_email", "access_token"], resolve);
    });

    const safeData = data || {};
    if ((!safeData.firebaseToken && !safeData.access_token) || !safeData.user_email) {
      // console.log("ℹ️ Pas de token Firebase à rafraîchir");
      return;
    }

    console.log("🔄 Rafraîchissement automatique du token Firebase...");

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
            console.log("✅ Envoi de REFRESH_FIREBASE_TOKEN à l'onglet existant");
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "REFRESH_FIREBASE_TOKEN",
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn("⚠️ Error sending refresh message:", chrome.runtime.lastError.message);
              } else {
                console.log("✅ Token refresh message sent successfully");
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
          // Attendre que la page soit chargée
          setTimeout(() => {
            if (newTab && newTab.id) {
              chrome.tabs.sendMessage(newTab.id, {
                type: "REFRESH_FIREBASE_TOKEN",
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn("⚠️ Error sending refresh message to new tab:", chrome.runtime.lastError.message);
                } else {
                  console.log("✅ Token refresh message sent to new tab");
                  // Fermer l'onglet après 3 secondes
                  setTimeout(() => {
                    if (newTab.id) {
                      chrome.tabs.remove(newTab.id);
                      console.log("✅ Background tab closed after token refresh");
                    }
                  }, 3000);
                }
              });
            }
          }, 2000); // Attendre 2 secondes que la page se charge
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
