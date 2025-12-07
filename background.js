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
  "https://mymchat.fr";
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

// Vérifier au démarrage
checkConnectionStatus();

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
    checkAndEnableFeatures().then(() => {
      sendResponse({ success: true });
    });
    return true; // Indique qu'on va répondre de manière asynchrone
  }

  // 🔥 Nouveau: Support pour Firebase Token depuis la page web
  if (message.type === "FIREBASE_TOKEN" && message.token) {
    // console.log("✅ Background: Received Firebase token from web");

    // Stocker le token + email + user_id + timestamp ET activer toutes les features
    chrome.storage.local.set(
      {
        firebaseToken: message.token,
        user_email: message.user_email || "",
        user_id: message.user_id || "",
        access_token_stored_at: Date.now(), // Important: stocker la date pour vérifier l'expiration
        // Activer toutes les fonctionnalités par défaut
        mym_live_enabled: true,
        mym_badges_enabled: true,
        mym_stats_enabled: true,
        mym_emoji_enabled: true,
        mym_notes_enabled: true,
        mym_broadcast_enabled: true,
      },
      () => {
        console.log(
          "✅ Background: Firebase token stored and features enabled"
        );

        // Vérifier immédiatement le statut d'abonnement et la licence
        checkSubscriptionStatus();
        checkAndEnableFeatures();

        // 🎨 Mettre à jour l'icône après connexion
        updateExtensionIcon("connected");

        // Envoyer une réponse au content script
        sendResponse({ success: true });

        // Fermer l'onglet d'authentification si c'est le sender
        if (sender.tab && sender.tab.id) {
          chrome.tabs.remove(sender.tab.id);
        }
      }
    );

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
        mym_broadcast_enabled: true,
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
    mym_broadcast_enabled: false,
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
  // Vérifier immédiatement au démarrage
  checkSubscriptionStatus();

  // Puis vérifier selon l'intervalle configuré
  const interval =
    (globalThis.APP_CONFIG &&
      globalThis.APP_CONFIG.SUBSCRIPTION_CHECK_INTERVAL) ||
    60 * 60 * 1000;
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

        // console.log(
        //   "📡 Réponse API /check-subscription:",
        //   res.status,
        //   res.statusText
        // );

        if (!res.ok) {
          // console.log(
          //   "⚠️ Erreur API - token peut-être invalide, mais on garde la session"
          // );
          // Ne pas désactiver automatiquement en cas d'erreur API
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
          // // console.log("✅ Accès actif :", {
          //   subscription: result.subscription_active,
          //   trial: result.trial_days_remaining,
          // });
          // Tout est OK, ne rien faire
        } else {
          // SEULEMENT si l'abonnement est vraiment expiré (pas le token)
          // // console.log("⚠️  Abonnement expiré - désactivation des features");
          disableAllFeatures();

          // Supprimer le token car l'abonnement est expiré
          chrome.storage.local.remove([
            "access_token",
            "access_token_stored_at",
            "user_email",
          ]);

          // // console.log("⚠️ Abonnement expiré - token supprimé");
        }
      } catch (err) {
        console.error("❌ Erreur vérification statut:", err);
        // En cas d'erreur réseau, on ne désactive pas (pour éviter les faux positifs)
      }
    } // Fin du callback async chrome.storage.local.get
  ); // Fin de chrome.storage.local.get
} // Fin de checkSubscriptionStatus

function disableAllFeatures() {
  chrome.storage.local.set(
    {
      mym_live_enabled: false,
      mym_badges_enabled: false,
      mym_stats_enabled: false,
      mym_emoji_enabled: false,
      mym_notes_enabled: false,
      mym_broadcast_enabled: false,
    },
    () => {
      // // console.log("🚫 Toutes les fonctionnalités désactivées");
      updateExtensionIcon("disconnected");
    }
  );
}

// 🔓 Vérifier et activer automatiquement les fonctionnalités si licence agence active
async function checkAndEnableFeatures() {
  try {
    const API_BASE =
      (globalThis.APP_CONFIG && globalThis.APP_CONFIG.API_BASE) ||
      "http://127.0.0.1:8080";
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
          mym_broadcast_enabled: false,
        };
        await chrome.storage.local.set(allDisabled);
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
          mym_broadcast_enabled: false,
        };
        await chrome.storage.local.set(allDisabled);
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
      data.agency_license_active === true || data.subscription_active === true;

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
        mym_broadcast_enabled: true,
      };

      await chrome.storage.local.set(allEnabled);
    } else {
      // console.log("🚫 Pas d'accès actif - désactivation des fonctionnalités");

      const allDisabled = {
        mym_live_enabled: false,
        mym_badges_enabled: false,
        mym_stats_enabled: false,
        mym_emoji_enabled: false,
        mym_notes_enabled: false,
        mym_broadcast_enabled: false,
      };

      await chrome.storage.local.set(allDisabled);
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
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local") {
    if (changes.firebaseToken || changes.user_email) {
      console.log(
        "🔄 Token/email modifié - vérification de la licence agence..."
      );
      await checkAndEnableFeatures();
    }
  }
});

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
chrome.alarms.create("checkLicenseAlarm", {
  periodInMinutes: licenseCheckInterval,
});

// Créer une alarme pour rafraîchir le token Firebase
const tokenRefreshInterval =
  (globalThis.APP_CONFIG && globalThis.APP_CONFIG.TOKEN_REFRESH_INTERVAL_MIN) ||
  50;
chrome.alarms.create("refreshTokenAlarm", {
  periodInMinutes: tokenRefreshInterval,
});

// Écouter l'alarme
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkLicenseAlarm") {
    checkAndEnableFeatures();
  } else if (alarm.name === "refreshTokenAlarm") {
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
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "REFRESH_FIREBASE_TOKEN",
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
        updateExtensionIcon("connected");
      } else {
        updateExtensionIcon("disconnected");
      }
    }
  }
});
