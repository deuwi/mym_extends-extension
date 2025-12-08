// background.js - Initialize default values on extension install

// 🦊 Firefox utilise 'browser' nativement, Chrome utilise 'chrome'
// On créé un alias unifié
if (typeof browser !== "undefined") {
  // Firefox - utiliser l'API native
  if (typeof chrome === "undefined") {
    globalThis.chrome = browser;
  }
}

// console.log("🚀 [BACKGROUND] Script starting...");
console.log(
  "🔍 [BACKGROUND] Runtime detected:",
  typeof browser !== "undefined"
    ? "Firefox (browser API)"
    : "Chrome (chrome API)"
);

// Configuration is loaded via manifest.json scripts array for Firefox compatibility
try {
  console.log(
    "🔍 [BACKGROUND] Checking APP_CONFIG:",
    typeof globalThis.APP_CONFIG
  );
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
console.log(`🔧 [BACKGROUND] Loaded with API_BASE: ${API_BASE}`);
console.log(
  `🔧 [BACKGROUND] TOKEN_MAX_AGE: ${
    TOKEN_MAX_AGE / (24 * 60 * 60 * 1000)
  } jours`
);
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
            console.log(`🎨 [BACKGROUND] Icon updated to: ${status}`);
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
      if (data.firebaseToken || data.access_token) {
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

// 🩺 Heartbeat pour vérifier que le background reste actif sur Firefox
setInterval(() => {
  console.log(
    "💓 [BACKGROUND] Heartbeat - script still running at",
    new Date().toLocaleTimeString()
  );
}, 30000); // Log toutes les 30 secondes

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

  // 🔥 CHROME FIX: Message pour forcer la vérification de l'abonnement
  if (message.type === "FORCE_SUBSCRIPTION_CHECK") {
    console.log("🔄 [BACKGROUND] Forced subscription check requested from content script");
    checkAndEnableFeatures().then(() => {
      sendResponse({ success: true });
    }).catch((err) => {
      console.error("❌ [BACKGROUND] Error during forced check:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Réponse asynchrone
  }

  // 🔥 Nouveau: Support pour Firebase Token depuis la page web
  if (message.type === "FIREBASE_TOKEN" && message.token) {
    // console.log("✅ Background: Received Firebase token from web");

    // IMPORTANT: Vérifier que le token n'est pas expiré avant de le stocker
    console.log("🔍 Background: Validating Firebase token...");

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
        console.log("✅ Background: Token validé avec succès");

        // Stocker le token + email + user_id + timestamp
        // SANS activer automatiquement les features (il faut vérifier l'abonnement d'abord)
        chrome.storage.local.set(
          {
            firebaseToken: message.token,
            user_email: message.user_email || "",
            user_id: message.user_id || "",
            access_token_stored_at: Date.now(), // Important: stocker la date pour vérifier l'expiration
          },
          () => {
            console.log(
              "✅ Background: Firebase token stored (checking subscription status...)"
            );

            // Ne pas mettre l'icône à "connected" tout de suite
            // Vérifier d'abord le statut d'abonnement qui mettra à jour l'icône
            checkSubscriptionStatus().then(() => {
              // Si l'abonnement est valide, les features seront activées automatiquement
              // Sinon, l'utilisateur restera connecté mais sans accès aux features
            });

            // Envoyer une réponse au content script
            sendResponse({ success: true });

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
    const updates = {};

    // Only set values that don't exist yet
    Object.entries(defaults).forEach(([key, value]) => {
      if (items[key] === undefined) {
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
  
  console.log(`⏰ [BACKGROUND] Subscription check interval: ${interval / 1000 / 60} minutes`);
  
  // Vérifier immédiatement au démarrage
  checkSubscriptionStatus();

  // Puis vérifier selon l'intervalle configuré
  setInterval(checkSubscriptionStatus, interval);
}

async function checkSubscriptionStatus() {
  chrome.storage.local.get(
    ["access_token", "firebaseToken", "access_token_stored_at", "user_email"],
    async (data) => {
      // Priorité au firebaseToken, sinon access_token
      const token = data.firebaseToken || data.access_token;
      const email = data.user_email;
      const tokenTime = data.access_token_stored_at || 0;
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

        console.log(
          `🔧 Background - Mode ${
            isLocal ? "LOCAL" : "PRODUCTION"
          }: vérification abonnement`
        );

        const res = await fetch(API_BASE + "/check-subscription", {
          headers,
        });

        console.log(
          "📡 Réponse API /check-subscription:",
          res.status,
          res.statusText
        );

        if (!res.ok) {
          if (res.status === 401) {
            console.log("⚠️ Réponse HTTP 401 - Token invalide ou expiré");
            console.log("🔒 Nettoyage des credentials et déconnexion complète");
            disableAllFeatures();
            chrome.storage.local.remove([
              "access_token",
              "access_token_stored_at",
              "user_email",
              "firebaseToken",
              "user_id",
            ]);
            updateExtensionIcon("disconnected");
          }
          // Pour les autres erreurs (500, 503, etc.), on garde la session
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
          disableAllFeatures();

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
          console.log("✅ Abonnement actif - activation des fonctionnalités");
          // Activer toutes les fonctionnalités
          chrome.storage.local.set({
            mym_live_enabled: true,
            mym_badges_enabled: true,
            mym_stats_enabled: true,
            mym_emoji_enabled: true,
            mym_notes_enabled: true,
          });
          updateExtensionIcon("connected");
        } else {
          // Abonnement expiré : GARDER la connexion mais DÉSACTIVER les features
          console.log(
            "⚠️ Abonnement expiré - désactivation des fonctionnalités (utilisateur reste connecté)"
          );
          disableAllFeatures();
          updateExtensionIcon("disconnected");

          // ⚠️ NE PAS supprimer les credentials - l'utilisateur reste connecté
          // Il pourra voir son statut dans la popup et renouveler son abonnement
        }
      } catch (err) {
        console.error("❌ Erreur vérification statut:", err);
        // En cas d'erreur réseau, on ne désactive pas (pour éviter les faux positifs)
      }
    } // Fin du callback async chrome.storage.local.get
  ); // Fin de chrome.storage.local.get
} // Fin de checkSubscriptionStatus

// Version synchrone pour vérification immédiate (retourne une Promise)
async function checkSubscriptionStatusSync() {
  console.log("🔍 [BACKGROUND] checkSubscriptionStatusSync called");
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["access_token", "firebaseToken", "user_email"],
      async (data) => {
        const token = data.firebaseToken || data.access_token;
        const email = data.user_email;

        console.log("🔍 [BACKGROUND] Storage data:", {
          hasFirebaseToken: !!data.firebaseToken,
          hasAccessToken: !!data.access_token,
          email: email
        });

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

          console.log(`🔍 [BACKGROUND] Calling ${API_BASE}/check-subscription`);
          const res = await fetch(API_BASE + "/check-subscription", {
            headers,
          });

          if (!res.ok) {
            console.log("⚠️ Sync check failed:", res.status);
            if (res.status === 401) {
              // Token invalide : déconnexion complète
              disableAllFeatures();
              chrome.storage.local.remove([
                "access_token",
                "access_token_stored_at",
                "user_email",
                "firebaseToken",
                "user_id",
              ]);
              updateExtensionIcon("disconnected");
            }
            resolve(false);
            return;
          }

          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            resolve(false);
            return;
          }

          const result = await res.json();

          console.log("📊 [BACKGROUND] Subscription check result:", {
            email_verified: result.email_verified,
            subscription_active: result.subscription_active,
            trial_days_remaining: result.trial_days_remaining,
            agency_license_active: result.agency_license_active
          });

          if (result.email_verified === false) {
            console.warn("⚠️ Email non vérifié");
            disableAllFeatures();
            resolve(false);
            return;
          }

          if (result.subscription_active || result.trial_days_remaining > 0 || result.agency_license_active) {
            console.log("✅ Accès accordé (subscription, trial ou agency)");
            resolve(true);
          } else {
            // Abonnement expiré : désactiver les features mais GARDER la connexion
            console.warn("⚠️ Aucun accès actif détecté");
            disableAllFeatures();
            // ⚠️ NE PAS supprimer les credentials - l'utilisateur reste connecté
            resolve(false);
          }
        } catch (err) {
          console.error("❌ Erreur vérification statut sync:", err);
          resolve(false);
        }
      }
    );
  });
}

// Flag pour éviter les rechargements en boucle
let lastReloadTimestamp = 0;
const RELOAD_COOLDOWN = 5000; // 5 secondes minimum entre les rechargements

function disableAllFeatures() {
  console.log("🚫 [BACKGROUND] disableAllFeatures called");
  chrome.storage.local.get(
    [
      "mym_live_enabled",
      "mym_badges_enabled",
      "mym_stats_enabled",
      "mym_emoji_enabled",
      "mym_notes_enabled",
    ],
    (currentState) => {
      console.log("📊 [BACKGROUND] Current features state:", currentState);
      const wasAnyEnabled = Object.values(currentState).some(
        (val) => val === true
      );
      console.log(`📊 [BACKGROUND] Any feature was enabled: ${wasAnyEnabled}`);

      chrome.storage.local.set(
        {
          mym_live_enabled: false,
          mym_badges_enabled: false,
          mym_stats_enabled: false,
          mym_emoji_enabled: false,
          mym_notes_enabled: false,
        },
        () => {
          console.log("🚫 Toutes les fonctionnalités désactivées");
          updateExtensionIcon("disconnected");

          // 🔄 Recharger uniquement si :
          // 1. Des fonctionnalités étaient activées avant
          // 2. Pas de rechargement récent (évite les boucles)
          const now = Date.now();
          if (wasAnyEnabled && now - lastReloadTimestamp > RELOAD_COOLDOWN) {
            lastReloadTimestamp = now;
            console.log(
              "🔄 Rechargement des onglets pour appliquer la désactivation"
            );
            chrome.tabs.query({ url: "*://*.mym.fans/*" }, (tabs) => {
              if (chrome.runtime.lastError) {
                console.warn("⚠️ Tab query error:", chrome.runtime.lastError.message);
                return;
              }
              tabs.forEach((tab) => {
                chrome.tabs.get(tab.id, (existingTab) => {
                  if (!chrome.runtime.lastError && existingTab) {
                    chrome.tabs.reload(tab.id);
                  }
                });
              });
            });
          } else {
            console.log("ℹ️ Rechargement ignoré (cooldown ou déjà désactivé)");
          }
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
    const token = storageData.firebaseToken || storageData.access_token;
    const email = storageData.user_email;
    const tokenStoredAt = storageData.access_token_stored_at;

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
        updateExtensionIcon("disconnected");
        return;
      }
    }

    console.log(
      `🔍 Credentials trouvés - email: ${email}, token: ${
        token ? "présent" : "absent"
      }`
    );

    // Préparer les headers selon l'environnement
    const headers = isLocal
      ? {
          "X-Dev-User-Email": email || "dev@test.com",
          "X-Dev-User-ID": "dev-user",
        }
      : {
          Authorization: `Bearer ${token}`,
        };

    console.log(
      `🔍 Vérification licence agence sur ${API_BASE}/check-subscription...`
    );

    const res = await fetch(`${API_BASE}/check-subscription`, {
      headers,
    });

    if (!res.ok) {
      console.warn(
        `⚠️ Réponse HTTP ${res.status} lors de la vérification de la licence`
      );

      // Si token expiré (401), déconnecter l'utilisateur
      if (res.status === 401) {
        console.warn("🔒 Token expiré - nettoyage des credentials");
        await chrome.storage.local.remove([
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
        updateExtensionIcon("disconnected");
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

    console.log("📊 [BACKGROUND] checkAndEnableFeatures - API response:", {
      agency_license_active: data.agency_license_active,
      subscription_active: data.subscription_active,
      trial_days_remaining: data.trial_days_remaining
    });

    // Si l'utilisateur a une licence agence active OU un abonnement actif, activer les fonctionnalités
    const hasAccess =
      data.agency_license_active === true || data.subscription_active === true || (data.trial_days_remaining && data.trial_days_remaining > 0);

    console.log(`🔐 [BACKGROUND] Access check: hasAccess=${hasAccess}`);

    if (hasAccess) {
      console.log(
        "🔓 Accès actif - activation automatique des fonctionnalités"
      );

      const allEnabled = {
        mym_live_enabled: true,
        mym_badges_enabled: true,
        mym_stats_enabled: true,
        mym_emoji_enabled: true,
        mym_notes_enabled: true,
      };

      await chrome.storage.local.set(allEnabled);
      updateExtensionIcon("connected");
      console.log("✅ [BACKGROUND] Features enabled, icon set to connected");
    } else {
      console.log("🚫 [BACKGROUND] No active access - disabling features");

      const allDisabled = {
        mym_live_enabled: false,
        mym_badges_enabled: false,
        mym_stats_enabled: false,
        mym_emoji_enabled: false,
        mym_notes_enabled: false,
      };

      await chrome.storage.local.set(allDisabled);
      updateExtensionIcon("disconnected");
      console.log("🚫 [BACKGROUND] Features disabled, icon set to disconnected");
    }
  } catch (err) {
    // Erreur silencieuse si problème réseau ou backend indisponible
    // L'extension continue de fonctionner avec les paramètres actuels
    if (err.message && err.message.includes("Failed to fetch")) {
      console.log(
        "ℹ️  Backend temporairement indisponible - conservation des paramètres actuels"
      );
    } else {
      console.error(
        "❌ Erreur lors de la vérification de la licence agence:",
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

// Vérifier aussi quand le service worker se réveille
self.addEventListener("activate", () => {
  // console.log("🔄 Service worker activé - vérification de la licence...");
  checkAndEnableFeatures();
});

// Vérifier immédiatement si déjà des credentials en storage
chrome.storage.local.get(["firebaseToken", "user_email"], (data) => {
  if (data.firebaseToken || data.user_email) {
    console.log(
      "🔍 Credentials détectés au démarrage - vérification immédiate de la licence"
    );
    checkAndEnableFeatures();
  }
});

// Créer une alarme pour vérifier périodiquement la licence
const licenseCheckInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.LICENSE_CHECK_INTERVAL_MIN) ||
  30;
console.log(`⏰ [BACKGROUND] License check alarm: every ${licenseCheckInterval} minutes`);
chrome.alarms.create("checkLicenseAlarm", {
  periodInMinutes: licenseCheckInterval,
});

// Créer une alarme pour rafraîchir le token Firebase
const tokenRefreshInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.TOKEN_REFRESH_INTERVAL_MIN) ||
  50;
console.log(`⏰ [BACKGROUND] Token refresh alarm: every ${tokenRefreshInterval} minutes`);
chrome.alarms.create("refreshTokenAlarm", {
  periodInMinutes: tokenRefreshInterval,
});

// Écouter l'alarme
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`⏰ [BACKGROUND] Alarm triggered: ${alarm.name}`);
  if (alarm.name === "checkLicenseAlarm") {
    console.log("🔍 [BACKGROUND] Running checkAndEnableFeatures from alarm...");
    checkAndEnableFeatures();
  } else if (alarm.name === "refreshTokenAlarm") {
    console.log("🔄 [BACKGROUND] Running refreshFirebaseToken from alarm...");
    refreshFirebaseToken();
  }
});

// 🔄 Rafraîchir le token Firebase de manière proactive
async function refreshFirebaseToken() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["firebaseToken", "user_email"], resolve);
    });

    if (!data.firebaseToken || !data.user_email) {
      // console.log("ℹ️ Pas de token Firebase à rafraîchir");
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
        chrome.tabs.get(tabs[0].id, (tab) => {
          if (!chrome.runtime.lastError && tab) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "REFRESH_FIREBASE_TOKEN",
            });
          }
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
        console.log("🔄 Token détecté, vérification de l'abonnement...");
        checkAndEnableFeatures();
      } else {
        // Token supprimé = déconnexion
        updateExtensionIcon("disconnected");
      }
    }
  }
});
