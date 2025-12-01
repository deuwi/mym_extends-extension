// background.js - Initialize default values on extension install
const API_BASE = "https://mymextends-backend-production.up.railway.app";

// 🌉 Écouter les messages du auth-bridge (connexion Google depuis le site web)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        // console.log("✅ Background: Token stored and features enabled");
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
  // Vérifier immédiatement au démarrage
  checkSubscriptionStatus();

  // Puis vérifier toutes les heures
  setInterval(checkSubscriptionStatus, 60 * 60 * 1000);
}

async function checkSubscriptionStatus() {
  chrome.storage.local.get(
    ["access_token", "access_token_stored_at"],
    async (data) => {
      const token = data.access_token;
      const tokenTime = data.access_token_stored_at || 0;
      const now = Date.now();
      const ageMs = now - tokenTime;
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;

      // Si pas de token, ne rien faire (utilisateur pas connecté)
      if (!token) {
        // console.log("ℹ️  Pas de token - utilisateur non connecté");
        return;
      }

      // Si token trop vieux (90 jours), NE PAS désactiver, juste logger
      // L'utilisateur devra se reconnecter mais on ne supprime rien
      if (ageMs > ninetyDays) {
        // console.log("⚠️  Token expiré (>90 jours) - veuillez vous reconnecter");
        // Ne pas désactiver les features, juste informer
        return;
      }

      // Vérifier le statut avec le backend
      try {
        // console.log("🔍 Vérification token:", token?.substring(0, 20) + "...");
        const res = await fetch(API_BASE + "/api/check-subscription", {
          headers: { Authorization: `Bearer ${token}` },
        });

        // console.log(
        //   "📡 Réponse API /api/check-subscription:",
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

        const result = await res.json();

        // Vérifier si l'email est vérifié (depuis le champ de la réponse)
        if (result.email_verified === false) {
          // console.log("⚠️  Email non vérifié - désactivation des features");
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
          // console.log("✅ Accès actif :", {
          //   subscription: result.subscription_active,
          //   trial: result.trial_days_remaining,
          // });
          // Tout est OK, ne rien faire
        } else {
          // SEULEMENT si l'abonnement est vraiment expiré (pas le token)
          // console.log("⚠️  Abonnement expiré - désactivation des features");
          disableAllFeatures();

          // Supprimer le token car l'abonnement est expiré
          chrome.storage.local.remove([
            "access_token",
            "access_token_stored_at",
            "user_email",
          ]);

          // console.log("⚠️ Abonnement expiré - token supprimé");
        }
      } catch (err) {
        console.error("❌ Erreur vérification statut:", err);
        // En cas d'erreur réseau, on ne désactive pas (pour éviter les faux positifs)
      }
    }
  );
}

function disableAllFeatures() {
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
    }
  );
}

// Lancer la vérification au démarrage de l'extension
startSubscriptionCheck();
