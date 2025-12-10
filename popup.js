// popup.js - Direct login authentication (no pairing codes)
(function () {
  const API_BASE = window.APP_CONFIG?.API_BASE || "https://mymchat.fr";
  const SIGNIN_URL =
    window.APP_CONFIG?.SIGNIN_URL || "https://mymchat.fr/signin";
  const FRONTEND_URL = window.APP_CONFIG?.FRONTEND_URL || "https://mymchat.fr";
  const TOKEN_MAX_AGE =
    window.APP_CONFIG?.TOKEN_MAX_AGE || 365 * 24 * 60 * 60 * 1000;

  // console.log(`🔧 Popup loaded with API_BASE: ${API_BASE}`);

  const toggles = {
    toggle: "mym_live_enabled",
    "toggle-badges": "mym_badges_enabled",
    "toggle-stats": "mym_stats_enabled",
    "toggle-emoji": "mym_emoji_enabled",
    "toggle-notes": "mym_notes_enabled",
  };

  // Elements
  const authSection = document.getElementById("auth-section");
  const userSection = document.getElementById("user-section");
  const connectBtn = document.getElementById("connectBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const authStatus = document.getElementById("authStatus");
  const userEmailSpan = document.getElementById("userEmail");
  const subscriptionBadge = document.getElementById("subscriptionBadge");
  const pricingLinkContainer = document.getElementById("pricingLinkContainer");

  // License section elements (declared early for use in showUserSection)
  const licenseSection = document.getElementById("license-section");
  const licenseFormContainer = document.getElementById(
    "license-form-container"
  );
  const licenseStatusContainer = document.getElementById(
    "license-status-container"
  );
  const licenseKeyInput = document.getElementById("licenseKeyInput");
  const activateLicenseBtn = document.getElementById("activateLicenseBtn");
  const licenseActivateStatus = document.getElementById(
    "licenseActivateStatus"
  );
  const licenseStatusDisplay = document.getElementById("licenseStatusDisplay");
  const licenseDetails = document.getElementById("licenseDetails");

  function renderToggle(element, isOn) {
    if (isOn) element.classList.add("on");
    else element.classList.remove("on");
  }

  // Initialize all toggles
  const defaults = {
    mym_live_enabled: false,
    mym_badges_enabled: false,
    mym_stats_enabled: false,
    mym_emoji_enabled: false,
    mym_notes_enabled: false,
  };

  let isInitializing = true; // Flag pour éviter les recharges lors de l'ouverture

  // 🔄 Écouter les changements dans le storage (pour la connexion Google et le background)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      // Ignorer les changements pendant l'initialisation (1 seconde après ouverture)
      if (isInitializing) {
        return;
      }

      // Rafraîchir si le token change OU si les features sont activées (= background a vérifié)
      const tokenChanged = changes.access_token || changes.firebaseToken;
      const featuresChanged =
        changes.mym_live_enabled ||
        changes.mym_badges_enabled ||
        changes.mym_stats_enabled ||
        changes.mym_emoji_enabled ||
        changes.mym_notes_enabled;

      if (tokenChanged || featuresChanged) {
        // console.log("🔄 Storage changed, refreshing UI...", { tokenChanged, featuresChanged });
        // Attendre un peu que toutes les valeurs soient stockées
        setTimeout(() => {
          initializeAuth();
        }, 100);
      }
    }
  });

  // Désactiver le flag d'initialisation après 1 seconde
  setTimeout(() => {
    isInitializing = false;
  }, 1000);

  // Function pour initialiser l'authentification
  function initializeAuth() {
    chrome.storage.local.get(
      [
        "access_token",
        "firebaseToken",
        "access_token_stored_at",
        "user_email",
        ...Object.values(toggles),
      ],
      (data) => {
        const safeData = data || {};
        // Priorité au firebaseToken, sinon access_token
        const token = safeData.firebaseToken || safeData.access_token;
        const tokenTime = safeData.access_token_stored_at;
        
        // 🔍 Vérifier si les features sont activées (le background a déjà vérifié l'abonnement)
        const anyFeatureEnabled = Object.values(toggles).some(
          (storageKey) => data[storageKey] === true
        );
        
        if (!token) {
          // Pas de token - afficher formulaire de connexion
          showAuthSection();
          disableAllToggles();
        } else if (anyFeatureEnabled) {
          // Features activées = Background a vérifié l'abonnement = OK
          // Vérifier quand même pour afficher les infos (mais ne pas bloquer si erreur)
          // console.log("✅ Features activées détectées, affichage interface utilisateur");
          verifyToken(token, data.user_email);
        } else if (tokenTime) {
          // Vérifier l'âge seulement si on a un timestamp
          const now = Date.now();
          const ageMs = now - tokenTime;
          const maxAge = 365 * 24 * 60 * 60 * 1000; // 365 jours
          
          if (ageMs > maxAge) {
            console.warn(`⚠️ Token trop ancien (${Math.floor(ageMs / (24 * 60 * 60 * 1000))} jours), vérification avec backend`);
          }
          // Toujours vérifier avec le backend, même si ancien
          verifyToken(token, data.user_email);
        } else {
          // Pas de timestamp (firebaseToken sans access_token_stored_at) - vérifier directement
          verifyToken(token, data.user_email);
        }

        // Initialize toggles state
        Object.entries(toggles).forEach(([elementId, storageKey]) => {
          const element = document.getElementById(elementId);
          if (element) {
            const val = data[storageKey] ?? defaults[storageKey];
            renderToggle(element, val);
          }
        });
      }
    );
  }

  // Check authentication status on load
  initializeAuth();

  function showAuthSection() {
    authSection.style.display = "block";
    userSection.style.display = "none";
    if (licenseSection) licenseSection.style.display = "none";
  }

  function showUserSection(email, subscriptionData) {
    authSection.style.display = "none";
    userSection.style.display = "block";
    userEmailSpan.textContent = email;

    // Vérifier si l'utilisateur a une licence agence
    const hasAgencyLicense = subscriptionData.agency_license_active === true;
    const hasSubscription = subscriptionData.subscription_active === true;
    const hasTrial = subscriptionData.trial_days_remaining > 0;
    const hasActiveAccess = hasSubscription || hasTrial || hasAgencyLicense;

    // N'afficher la section licence que si l'utilisateur n'a pas déjà un accès actif

    if (licenseSection) {
      if (hasAgencyLicense || (!hasSubscription && !hasTrial)) {
        // console.log("✅ Showing license section");
        licenseSection.style.display = "block";
        // Vérifier et afficher le formulaire ou le statut de licence
        checkLicense().then((licenseData) => {
          showLicenseSection(licenseData);
        });
      } else {
        // console.log("❌ Hiding license section");
        licenseSection.style.display = "none";
      }
    } else {
      console.error("❌ licenseSection element not found!");
    }

    // Update subscription badge
    if (subscriptionData.email_verified === false) {
      subscriptionBadge.className = "subscription-badge inactive";
      subscriptionBadge.textContent = "⚠️ Email non vérifié";
      if (pricingLinkContainer) pricingLinkContainer.style.display = "none";
      showStatus(
        "⚠️ Veuillez vérifier votre email pour utiliser l'extension. Consultez votre profil sur le site.",
        "error"
      );
    } else if (hasAgencyLicense) {
      subscriptionBadge.className = "subscription-badge active";
      subscriptionBadge.textContent = subscriptionData.agency_name
        ? `🏢 ${subscriptionData.agency_name}`
        : "🏢 Licence Agence";
      if (pricingLinkContainer) pricingLinkContainer.style.display = "none";

      // 🔓 Auto-activer toutes les fonctionnalités avec une licence agence
      enableAllFeaturesAutomatically();
    } else if (subscriptionData.status === "error") {
      subscriptionBadge.className = "subscription-badge inactive";
      subscriptionBadge.textContent = "⚠️ Erreur";
      if (pricingLinkContainer) pricingLinkContainer.style.display = "none";
    } else if (subscriptionData.subscription_active) {
      subscriptionBadge.className = "subscription-badge active";
      subscriptionBadge.textContent = "✓ Premium";
      if (pricingLinkContainer) pricingLinkContainer.style.display = "none";
    } else if (subscriptionData.trial_days_remaining > 0) {
      subscriptionBadge.className = "subscription-badge trial";
      subscriptionBadge.textContent = `⏰ Essai (${subscriptionData.trial_days_remaining}j)`;
      if (pricingLinkContainer) pricingLinkContainer.style.display = "none";
    } else {
      subscriptionBadge.className = "subscription-badge inactive";
      subscriptionBadge.textContent = "✗ Expiré";
      // Afficher le lien vers la page de tarification si l'essai ou l'abonnement a expiré
      if (pricingLinkContainer) pricingLinkContainer.style.display = "flex";
    }
  }

  function disableAllToggles() {
    Object.keys(toggles).forEach((elementId) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.opacity = "0.3";
        element.style.pointerEvents = "none";
      }
    });
  }

  function enableAllToggles() {
    Object.keys(toggles).forEach((elementId) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.opacity = "1";
        element.style.pointerEvents = "auto";
      }
    });
  }

  // 🔓 Activer automatiquement toutes les fonctionnalités
  function enableAllFeaturesAutomatically() {
    // console.log("🔓 Auto-activation de toutes les fonctionnalités...");

    // Activer tous les toggles dans le storage
    const allEnabled = {
      mym_live_enabled: true,
      mym_badges_enabled: true,
      mym_stats_enabled: true,
      mym_emoji_enabled: true,
      mym_notes_enabled: true,
    };

    chrome.storage.local.set(allEnabled, () => {
      // console.log("✅ Toutes les fonctionnalités activées automatiquement");

      // Mettre à jour l'UI
      Object.entries(toggles).forEach(([elementId, storageKey]) => {
        const element = document.getElementById(elementId);
        if (element) {
          renderToggle(element, true);
        }
      });
    });
  }

  // Fonction pour vérifier l'abonnement avec le token Firebase
  async function checkSubscription() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "firebaseToken",
          "access_token",
          "user_email",
          "access_token_stored_at",
        ],
        async (data) => {
          const safeData = data || {};
          const token = safeData.firebaseToken || safeData.access_token;
          const email = safeData.user_email;
          const tokenStoredAt = safeData.access_token_stored_at;

          if (!token && !email) {
            console.error("❌ Aucun token disponible");
            showAuthSection();
            disableAllToggles();
            resolve();
            return;
          }

          // Vérifier l'âge du token
          if (tokenStoredAt) {
            const tokenAge = Date.now() - tokenStoredAt;
            if (tokenAge > TOKEN_MAX_AGE) {
              console.warn(
                `⚠️ Token expiré (âge: ${Math.floor(
                  tokenAge / (24 * 60 * 60 * 1000)
                )} jours)`
              );
              chrome.storage.local.remove(
                [
                  "access_token",
                  "firebaseToken",
                  "access_token_stored_at",
                  "user_id",
                  "user_email",
                ],
                () => {
                  showStatus(
                    "⚠️ Votre session a expiré. Veuillez vous reconnecter.",
                    "error"
                  );
                  showAuthSection();
                  disableAllToggles();
                  resolve();
                }
              );
              return;
            }
          }

          try {
            // Déterminer si on est en mode local
            const isLocal = window.APP_CONFIG?.ENVIRONMENT === "local";

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
              console.error("❌ Erreur API:", res.status);
              
              // Si 401, token invalide - déconnecter
              if (res.status === 401) {
                chrome.storage.local.remove(
                  ["access_token", "firebaseToken", "access_token_stored_at", "user_id", "user_email"],
                  () => {
                    showAuthSection();
                    disableAllToggles();
                    showStatus("🔒 Session expirée. Veuillez vous reconnecter.", "error");
                  }
                );
              } else {
                // Erreur réseau/serveur - garder l'utilisateur connecté
                showUserSection(email || "Utilisateur", {
                  subscription_active: false,
                  trial_days_remaining: 0,
                  status: "error",
                  email_verified: true,
                });
                showStatus("⚠️ Impossible de vérifier l'abonnement (erreur serveur)", "error");
                enableAllToggles();
              }
              resolve();
              return;
            }

            // Vérifier que la réponse est bien du JSON
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              console.error(
                `❌ Réponse non-JSON reçue (${contentType}), erreur serveur`
              );
              // Erreur serveur - garder l'utilisateur connecté
              showUserSection(email || "Utilisateur", {
                subscription_active: false,
                trial_days_remaining: 0,
                status: "error",
                email_verified: true,
              });
              showStatus("⚠️ Erreur serveur, veuillez réessayer plus tard", "error");
              enableAllToggles();
              resolve();
              return;
            }

            const result = await res.json();
            // console.log("✅ Abonnement vérifié:", result);

            // Stocker l'email si disponible
            if (result.email) {
              chrome.storage.local.set({ user_email: result.email });
            }

            showUserSection(result.email, result);
            resolve();
          } catch (err) {
            console.error("❌ Erreur vérification abonnement:", err);
            // Erreur réseau - garder l'utilisateur connecté
            showUserSection(email || "Utilisateur", {
              subscription_active: false,
              trial_days_remaining: 0,
              status: "error",
              email_verified: true,
            });
            showStatus("⚠️ Impossible de vérifier l'abonnement (erreur réseau)", "error");
            enableAllToggles();
            resolve();
          }
        }
      );
    });
  }

  async function verifyToken(token, email) {
    try {
      // Récupérer l'email depuis le storage si non fourni
      if (!email) {
        const storageData = await new Promise((resolve) => {
          chrome.storage.local.get(["user_email"], (items) => {
            const safeItems = items || {};
            resolve(safeItems);
          });
        });
        email = storageData.user_email;
      }

      // Vérifier l'âge du token
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(["access_token_stored_at"], (items) => {
          const safeItems = items || {};
          resolve(safeItems.access_token_stored_at);
        });
      });

      if (result) {
        const tokenAge = Date.now() - result;
        if (tokenAge > TOKEN_MAX_AGE) {
          console.warn(
            `⚠️ Token expiré (âge: ${Math.floor(
              tokenAge / (24 * 60 * 60 * 1000)
            )} jours) - déconnexion`
          );
          chrome.storage.local.remove(
            ["access_token", "firebaseToken", "access_token_stored_at", "user_id", "user_email"],
            () => {
              showStatus(
                "⚠️ Votre session a expiré. Veuillez vous reconnecter.",
                "error"
              );
              showAuthSection();
              disableAllToggles();
            }
          );
          return;
        }
      }

      // Déterminer si on est en mode local
      const isLocal = window.APP_CONFIG?.ENVIRONMENT === "local";

      // En mode local, utiliser les headers de dev au lieu du token Firebase
      const headers = isLocal
        ? {
            "X-Dev-User-Email": email,
            "X-Dev-User-ID": "dev-user",
          }
        : { Authorization: `Bearer ${token}` };

      const res = await fetch(API_BASE + "/check-subscription", {
        headers,
      });
      if (!res.ok) {
        // Si token expiré (401), déconnecter l'utilisateur
        if (res.status === 401) {
          console.warn("🔒 Token expiré - déconnexion nécessaire");
          chrome.storage.local.remove(
            ["access_token", "firebaseToken", "access_token_stored_at", "user_id", "user_email"],
            () => {
              showStatus(
                "⚠️ Votre session a expiré. Veuillez vous reconnecter.",
                "error"
              );
              showAuthSection();
              disableAllToggles();
            }
          );
          return;
        }

        // Erreur API - on affiche quand même l'interface utilisateur
        // Mais on informe que la vérification a échoué
        showUserSection(email, {
          subscription_active: false,
          trial_days_remaining: 0,
          status: "error",
        });
        showStatus(
          "⚠️ Impossible de vérifier l'abonnement (erreur réseau)",
          "error"
        );
        enableAllToggles();

        // Mettre à jour visuellement les toggles
        chrome.storage.local.get(Object.values(toggles), (items) => {
          const safeItems = items || {};
          Object.entries(toggles).forEach(([elementId, storageKey]) => {
            const element = document.getElementById(elementId);
            if (element) {
              const isOn = safeItems[storageKey] ?? defaults[storageKey];
              renderToggle(element, isOn);
            }
          });
        });
        return;
      }

      // Vérifier que la réponse est bien du JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error(
          `❌ Réponse non-JSON reçue (${contentType}), erreur serveur`
        );
        showUserSection(email, {
          subscription_active: false,
          trial_days_remaining: 0,
          status: "error",
        });
        showStatus("⚠️ Erreur serveur (réponse invalide)", "error");
        enableAllToggles();
        return;
      }

      const data = await res.json();

      // Stocker l'email si disponible dans la réponse
      const userEmail = data.email || email;
      if (userEmail) {
        chrome.storage.local.set({ user_email: userEmail });
      }

      // Vérifier d'abord si l'email est vérifié
      if (data.email_verified === false) {
        showUserSection(userEmail, data);
        disableAllToggles();
        showStatus(
          "⚠️ Veuillez vérifier votre email pour utiliser l'extension. Consultez votre profil sur le site.",
          "error"
        );
        return;
      }

      if (
        data.subscription_active ||
        data.trial_days_remaining > 0 ||
        data.agency_license_active
      ) {
        showUserSection(userEmail, data);
        enableAllToggles();
        hideStatus();

        // Mettre à jour visuellement les toggles selon leur état dans le storage
        chrome.storage.local.get(Object.values(toggles), (items) => {
          const safeItems = items || {};
          Object.entries(toggles).forEach(([elementId, storageKey]) => {
            const element = document.getElementById(elementId);
            if (element) {
              const isOn = safeItems[storageKey] ?? defaults[storageKey];
              renderToggle(element, isOn);
            }
          });
        });
      } else {
        // Aucun accès actif - afficher l'utilisateur mais désactiver les toggles
        // et proposer de s'abonner ou d'utiliser une licence agence
        showUserSection(userEmail, data);
        disableAllToggles();

        // Vérifier si l'utilisateur a une licence agence (même révoquée)
        checkLicense().then((licenseData) => {
          if (licenseData && licenseData.license) {
            // Vérifier si l'abonnement de l'agence est inactif
            if (licenseData.agency_subscription_active === false) {
              showStatus(
                "⚠️ Votre agence a annulé son abonnement. Les fonctionnalités sont désactivées. Contactez votre agence ou souscrivez un abonnement individuel.",
                "error"
              );
            } else if (licenseData.license.status === "revoked") {
              // L'utilisateur a une licence mais elle est révoquée
              showStatus(
                "⚠️ Votre licence agence a été révoquée. Contactez votre agence ou souscrivez un abonnement.",
                "error"
              );
            } else {
              // L'utilisateur a une licence mais elle est inactive pour une autre raison
              showStatus(
                "⚠️ Votre licence agence est inactive. Contactez votre agence ou souscrivez un abonnement.",
                "error"
              );
            }
          } else {
            // Aucune licence - proposer de s'abonner ou d'activer une clé
            showStatus(
              "⚠️ Aucun accès actif. Souscrivez un abonnement ou activez une clé de licence agence ci-dessous.",
              "error"
            );
          }
        });
      }
    } catch (err) {
      console.error("Token verification failed:", err);

      // Vérifier si c'est une erreur de connexion (backend non accessible)
      const isConnectionError =
        err.message.includes("Failed to fetch") ||
        err.message.includes("NetworkError");

      if (isConnectionError) {
        // Backend non accessible - afficher l'interface mais avec un message clair
        showUserSection(email, {
          subscription_active: false,
          trial_days_remaining: 0,
          agency_license_active: false,
          status: "error",
        });
        showStatus(
          "⚠️ Impossible de se connecter au serveur. Vérifiez votre connexion internet ou réessayez plus tard.",
          "error"
        );
        disableAllToggles();
      } else {
        // Autre erreur - afficher quand même l'interface
        showUserSection(email, {
          subscription_active: false,
          trial_days_remaining: 0,
          agency_license_active: false,
          status: "error",
        });
        showStatus("⚠️ Erreur de connexion au serveur", "error");
        disableAllToggles();
      }
    }
  }

  function showStatus(message, type = "error") {
    authStatus.textContent = message;
    authStatus.className = `status-message ${type}`;
    authStatus.style.display = "block";
  }

  function hideStatus() {
    authStatus.style.display = "none";
  }

  // Logout handler
  function handleLogout() {
    // Supprimer TOUS les tokens et données utilisateur pour permettre de se connecter avec un autre compte
    chrome.storage.local.remove(
      [
        "access_token",
        "firebaseToken",
        "access_token_stored_at",
        "user_email",
        "user_id",
      ],
      () => {
        // console.log("🔓 Déconnexion complète - tous les tokens supprimés");
        showAuthSection();
        disableAllToggles();
        hideStatus();

        // Disable all toggles
        Object.entries(toggles).forEach(([elementId, storageKey]) => {
          chrome.storage.local.set({ [storageKey]: false }, () => {
            const element = document.getElementById(elementId);
            if (element) {
              renderToggle(element, false);
            }
          });
        });

        // Déconnecter du site mymchat.fr en supprimant les cookies de session
        const cookieDomains = ["mymchat.fr", ".mymchat.fr"];
        let totalCookiesRemoved = 0;

        if (chrome.cookies && chrome.cookies.getAll) {
          cookieDomains.forEach((domain) => {
            chrome.cookies.getAll({ domain: domain }, (cookies) => {
              const safeCookies = cookies || [];
              safeCookies.forEach((cookie) => {
                const url = `https://mymchat.fr${cookie.path}`;
                chrome.cookies.remove(
                  {
                    url: url,
                    name: cookie.name,
                  },
                  (details) => {
                    if (details) {
                      totalCookiesRemoved++;
                      // console.log(`🍪 Cookie supprimé: ${cookie.name}`);
                    }
                  }
                );
              });
            });
          });
        }

        setTimeout(() => {
          // console.log(`🍪 Total: ${totalCookiesRemoved} cookie(s) mymchat.fr supprimé(s)`);
          
          // Recharger les onglets mymchat.fr pour appliquer la déconnexion
          chrome.tabs.query({ url: "*://mymchat.fr/*" }, (tabs) => {
            tabs.forEach((tab) => {
              chrome.tabs.reload(tab.id);
            });
          });
        }, 500);
      }
    );
  }

  // Event listeners
  connectBtn.addEventListener("click", () => {
    // Ouvrir un onglet pour l'authentification
    chrome.tabs.create({
      url:
        (window.APP_CONFIG?.SIGNIN_URL || "https://mymchat.fr/signin") +
        "?redirect=extension",
    });

    // Écouter les changements dans le storage pour détecter le nouveau token
    const storageListener = (changes, areaName) => {
      if (areaName === "local" && changes.firebaseToken) {
        // console.log("✅ Nouveau token Firebase détecté");

        // Vérifier l'abonnement avec ce token
        checkSubscription().then(() => {
          showStatus("✅ Connecté avec succès", "success");
          setTimeout(() => {
            hideStatus();
            // Recharger le statut de connexion
            checkSubscription();
          }, 1500);
        });

        // Arrêter d'écouter
        chrome.storage.onChanged.removeListener(storageListener);
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    // Nettoyer le listener après 60 secondes
    setTimeout(() => {
      chrome.storage.onChanged.removeListener(storageListener);
    }, 60000);
  });
  logoutBtn.addEventListener("click", handleLogout);

  // Toggle handlers
  Object.entries(toggles).forEach(([elementId, storageKey]) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.addEventListener("click", async () => {
      // Récupérer la valeur actuelle pour savoir si on active ou désactive
      chrome.storage.local.get([storageKey], async (data) => {
        const safeData = data || {};
        const currentVal = safeData[storageKey] ?? false;
        const newVal = !currentVal;

        // 🔒 Vérifier l'abonnement UNIQUEMENT si on veut ACTIVER
        if (newVal) {
          const canActivate = await checkSubscriptionBeforeToggle();
          if (!canActivate) {
            showStatus(
              "⚠️ Accès Premium requis. Souscrivez un abonnement ou activez une licence agence.",
              "error"
            );
            setTimeout(hideStatus, 5000);
            return;
          }
        }

        // Activer ou désactiver
        chrome.storage.local.set({ 
          [storageKey]: newVal,
          user_manual_toggle_timestamp: Date.now() // Marquer le toggle manuel
        }, () => {
          renderToggle(element, newVal);
          
          // 🔄 Notifier le content script pour appliquer les changements immédiatement
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              const url = tabs[0].url || "";
              if (url.startsWith("http://") || url.startsWith("https://")) {
                chrome.tabs.sendMessage(
                  tabs[0].id,
                  {
                    action: "toggleFeature",
                    feature: storageKey,
                    enabled: newVal
                  },
                  (response) => {
                    if (chrome.runtime.lastError) {
                      // Content script non chargé, le changement sera appliqué au prochain chargement
                      console.log("Content script not loaded:", chrome.runtime.lastError.message);
                    }
                  }
                );
              }
            }
          });
        });
      });
    });

    // Keyboard accessibility
    element.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        element.click();
      }
    });
  });

  // 🔒 Vérifier le statut avant d'autoriser l'activation d'une feature
  async function checkSubscriptionBeforeToggle() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["firebaseToken", "access_token", "user_email"],
        async (data) => {
          const safeData = data || {};
          const token = safeData.firebaseToken || safeData.access_token;
          const email = safeData.user_email;

          if (!token && !email) {
            resolve(false);
            return;
          }

          try {
            // Déterminer si on est en mode local
            const isLocal = window.APP_CONFIG?.ENVIRONMENT === "local";

            // En mode local, utiliser les headers de dev
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
              resolve(false);
              return;
            }

            // Vérifier que la réponse est bien du JSON
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              console.warn(
                `⚠️ Réponse non-JSON dans checkSubscriptionBeforeToggle (${contentType})`
              );
              resolve(false);
              return;
            }

            const result = await res.json();

            // Vérifier email et subscription/trial/agency license
            const isActive =
              result.email_verified !== false &&
              (result.subscription_active ||
                result.trial_days_remaining > 0 ||
                result.agency_license_active === true);
            resolve(isActive);
          } catch (err) {
            console.error("Subscription check error:", err);
            resolve(false);
          }
        }
      );
    });
  }

  // === AGENCY LICENSE FUNCTIONS ===

  // Vérifier la licence au chargement
  async function checkLicense() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["firebaseToken", "access_token", "user_email"],
        async (data) => {
          const safeData = data || {};
          const token = safeData.firebaseToken || safeData.access_token;
          const email = safeData.user_email;

          if (!token && !email) {
            resolve(null);
            return;
          }

          try {
            const isLocal = window.APP_CONFIG?.ENVIRONMENT === "local";
            const headers = isLocal
              ? {
                  "X-Dev-User-Email": email || "dev@test.com",
                  "X-Dev-User-ID": "dev-user",
                }
              : { Authorization: `Bearer ${token}` };

            const res = await fetch(API_BASE + "/license/check", {
              headers,
            });
            if (!res.ok) {
              // console.log("ℹ️ Aucune licence agence trouvée");
              resolve(null);
              return;
            }

            // Vérifier que la réponse est bien du JSON
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              console.warn(
                `⚠️ Réponse non-JSON dans checkLicense (${contentType})`
              );
              resolve(null);
              return;
            }

            const result = await res.json();
            resolve(result.has_license ? result : null);
          } catch (err) {
            console.error("License check error:", err);
            resolve(null);
          }
        }
      );
    });
  }

  // Activer une licence
  async function activateLicense(licenseKey) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(
        ["firebaseToken", "access_token", "user_email"],
        async (data) => {
          const safeData = data || {};
          const token = safeData.firebaseToken || safeData.access_token;
          const email = safeData.user_email;

          if (!token && !email) {
            reject(new Error("Non authentifié"));
            return;
          }

          try {
            const isLocal = window.APP_CONFIG?.ENVIRONMENT === "local";
            const headers = isLocal
              ? {
                  "Content-Type": "application/json",
                  "X-Dev-User-Email": email || "dev@test.com",
                  "X-Dev-User-ID": "dev-user",
                }
              : {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                };

            const res = await fetch(API_BASE + "/license/activate", {
              method: "POST",
              headers,
              body: JSON.stringify({ license_key: licenseKey }),
            });

            // Vérifier que la réponse est bien du JSON
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              reject(new Error("Erreur serveur (réponse invalide)"));
              return;
            }

            const result = await res.json();

            if (!res.ok) {
              reject(new Error(result.error || "Erreur d'activation"));
              return;
            }

            resolve(result);
          } catch (err) {
            console.error("License activation error:", err);
            reject(err);
          }
        }
      );
    });
  }

  // Afficher la section licence
  function showLicenseSection(licenseData) {
    if (!licenseSection) return;

    licenseSection.style.display = "block";

    if (licenseData && licenseData.license) {
      // Licence active
      if (licenseFormContainer) licenseFormContainer.style.display = "none";
      if (licenseStatusContainer)
        licenseStatusContainer.style.display = "block";

      const license = licenseData.license;
      const isRevoked = license.status === "revoked";

      if (licenseStatusDisplay) {
        licenseStatusDisplay.className = `license-status ${
          isRevoked ? "revoked" : "active"
        }`;
        licenseStatusDisplay.innerHTML = `
          <span>${isRevoked ? "❌" : "✅"}</span>
          <div>
            <div><strong>${
              isRevoked ? "Licence révoquée" : "Licence active"
            }</strong></div>
            <div class="license-details">
              ${license.key}<br>
              ${licenseData.agency ? `Agence: ${licenseData.agency.name}` : ""}
              ${
                license.activated_at
                  ? `<br>Activée le: ${new Date(
                      license.activated_at
                    ).toLocaleDateString()}`
                  : ""
              }
            </div>
          </div>
        `;
      }
    } else {
      // Pas de licence - afficher le formulaire
      if (licenseFormContainer) licenseFormContainer.style.display = "block";
      if (licenseStatusContainer) licenseStatusContainer.style.display = "none";
    }
  }

  // Event listener pour l'activation
  if (activateLicenseBtn) {
    activateLicenseBtn.addEventListener("click", async () => {
      const licenseKey = licenseKeyInput.value.trim().toUpperCase();

      if (!licenseKey) {
        licenseActivateStatus.textContent =
          "Veuillez entrer une clé de licence";
        licenseActivateStatus.className = "status-message error";
        licenseActivateStatus.style.display = "block";
        return;
      }

      if (!licenseKey.startsWith("AGENCY-")) {
        licenseActivateStatus.textContent =
          "Format de clé invalide (doit commencer par AGENCY-)";
        licenseActivateStatus.className = "status-message error";
        licenseActivateStatus.style.display = "block";
        return;
      }

      try {
        activateLicenseBtn.disabled = true;
        activateLicenseBtn.textContent = "Activation...";
        licenseActivateStatus.style.display = "none";

        await activateLicense(licenseKey);

        licenseActivateStatus.textContent = "✅ Licence activée avec succès !";
        licenseActivateStatus.className = "status-message success";
        licenseActivateStatus.style.display = "block";

        // Recharger les données
        setTimeout(async () => {
          const licenseData = await checkLicense();
          showLicenseSection(licenseData);
          await checkSubscription();

          // Demander au background script de vérifier immédiatement la licence
          chrome.runtime.sendMessage({ action: "checkLicense" }, (response) => {
            
          });
        }, 1000);
      } catch (err) {
        licenseActivateStatus.textContent = `❌ ${err.message}`;
        licenseActivateStatus.className = "status-message error";
        licenseActivateStatus.style.display = "block";
        activateLicenseBtn.disabled = false;
        activateLicenseBtn.textContent = "Activer la licence";
      }
    });
  }

  // Formatter la clé pendant la saisie
  if (licenseKeyInput) {
    licenseKeyInput.addEventListener("input", (e) => {
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");

      // Format: AGENCY-XXXX-XXXX-XXXX-XXXX (29 caractères avec tirets)
      if (value.length > 6) {
        value = value.slice(0, 6) + "-" + value.slice(6);
      }
      if (value.length > 11) {
        value = value.slice(0, 11) + "-" + value.slice(11);
      }
      if (value.length > 16) {
        value = value.slice(0, 16) + "-" + value.slice(16);
      }
      if (value.length > 21) {
        value = value.slice(0, 21) + "-" + value.slice(21);
      }
      // Limiter à 29 caractères (AGENCY-XXXX-XXXX-XXXX-XXXX)
      e.target.value = value.slice(0, 29);
    });
  }

  // Initialiser la section licence après l'authentification
  const originalCheckSubscription = checkSubscription;
  checkSubscription = async function () {
    await originalCheckSubscription();

    // Vérifier la licence aussi
    const licenseData = await checkLicense();
    showLicenseSection(licenseData);

    // Demander au background script de vérifier immédiatement la licence
    chrome.runtime.sendMessage({ action: "checkLicense" }, (response) => {
      
    });
  };

  // Au chargement du popup, forcer la vérification de la licence
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: "checkLicense" }, (response) => {
      // console.log("🔓 Vérification de la licence au chargement du popup");
    });
  }, 500);

  // Initialiser le lien de tarification avec l'URL du config
  const pricingLink = document.getElementById("pricingLink");
  if (pricingLink) {
    pricingLink.href = `${FRONTEND_URL}/pricing`;
  }

  // ========================================
  // THEME MANAGEMENT
  // ========================================

  const THEMES = {
    default: {
      name: "Violet",
      primary: "#667eea",
      secondary: "#764ba2",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    blue: {
      name: "Bleu",
      primary: "#4facfe",
      secondary: "#00f2fe",
      gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    },
    green: {
      name: "Vert",
      primary: "#43e97b",
      secondary: "#38f9d7",
      gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    },
    pink: {
      name: "Rose",
      primary: "#f857a6",
      secondary: "#ff5858",
      gradient: "linear-gradient(135deg, #f857a6 0%, #ff5858 100%)",
    },
    orange: {
      name: "Orange",
      primary: "#fa709a",
      secondary: "#fee140",
      gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    },
    dark: {
      name: "Sombre",
      primary: "#434343",
      secondary: "#000000",
      gradient: "linear-gradient(135deg, #434343 0%, #000000 100%)",
    },
  };

  function applyTheme(themeName) {
    const theme = THEMES[themeName] || THEMES.default;
    
    // Appliquer les CSS variables
    document.documentElement.style.setProperty("--theme-primary", theme.primary);
    document.documentElement.style.setProperty("--theme-secondary", theme.secondary);
    document.documentElement.style.setProperty("--theme-gradient", theme.gradient);

    // Mettre à jour tous les éléments avec gradient
    const gradientElements = document.querySelectorAll(".popup-header h1, .toggle.on, .link-container a.pricing-link");
    gradientElements.forEach((el) => {
      if (el.classList.contains("toggle")) {
        el.style.background = theme.gradient;
      } else if (el.classList.contains("pricing-link")) {
        el.style.background = theme.gradient;
      } else if (el.tagName === "H1") {
        // Pour le h1, utiliser du texte blanc avec le thème sombre
        if (themeName === "dark") {
          el.style.background = "none";
          el.style.webkitTextFillColor = "#ffffff";
          el.style.color = "#ffffff";
        } else {
          el.style.background = theme.gradient;
          el.style.webkitBackgroundClip = "text";
          el.style.backgroundClip = "text";
          el.style.webkitTextFillColor = "transparent";
          el.style.color = "transparent";
        }
      } else {
        el.style.background = theme.gradient;
        el.style.webkitBackgroundClip = "text";
        el.style.backgroundClip = "text";
      }
    });

    // Stocker le thème sélectionné
    chrome.storage.local.set({ user_theme: themeName });

    // Envoyer le thème au content script pour l'appliquer sur la page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Vérifier que l'onglet est une page web valide (pas chrome://, about:, etc.)
        const url = tabs[0].url || "";
        if (url.startsWith("http://") || url.startsWith("https://")) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "applyTheme",
            theme: theme,
          }, (response) => {
            // Ignorer l'erreur si le content script n'est pas chargé
            if (chrome.runtime.lastError) {
              console.log("Content script not loaded on this page:", chrome.runtime.lastError.message);
            }
          });
        }
      }
    });
  }

  function initializeThemeSelector() {
    const themeOptions = document.querySelectorAll(".theme-option");
    
    // Charger le thème actuel
    chrome.storage.local.get(["user_theme"], (data) => {
      const currentTheme = data.user_theme || "default";
      
      // Appliquer le thème
      applyTheme(currentTheme);

      // Mettre à jour l'UI
      themeOptions.forEach((option) => {
        option.classList.remove("active");
        if (option.dataset.theme === currentTheme) {
          option.classList.add("active");
        }
      });
    });

    // Gérer les clics sur les thèmes
    themeOptions.forEach((option) => {
      option.addEventListener("click", () => {
        const themeName = option.dataset.theme;
        
        // Retirer la classe active de tous
        themeOptions.forEach((opt) => opt.classList.remove("active"));
        
        // Ajouter la classe active au sélectionné
        option.classList.add("active");
        
        // Appliquer le thème
        applyTheme(themeName);
      });
    });
  }

  // Initialiser le sélecteur de thème
  initializeThemeSelector();
})();
