// popup.js - Direct login authentication (no pairing codes)
(function () {
  const API_BASE = "https://mymchat.fr";

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
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginBtn = document.getElementById("loginBtn");
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const authStatus = document.getElementById("authStatus");
  const userEmailSpan = document.getElementById("userEmail");
  const subscriptionBadge = document.getElementById("subscriptionBadge");

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

  // 🔄 Écouter les changements dans le storage (pour la connexion Google)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.access_token) {
      console.log("🔄 Token changed, refreshing UI...", changes.access_token);
      // Attendre un peu que toutes les valeurs soient stockées
      setTimeout(() => {
        initializeAuth();
      }, 100);
    }
  });

  // Function pour initialiser l'authentification
  function initializeAuth() {
    chrome.storage.local.get(
      [
        "access_token",
        "access_token_stored_at",
        "user_email",
        ...Object.values(toggles),
      ],
      (data) => {
        const token = data.access_token;
        const tokenTime = data.access_token_stored_at || 0;
        const now = Date.now();
        const ageMs = now - tokenTime;
        const ninetyDays = 90 * 24 * 60 * 60 * 1000;

        if (!token) {
          // Pas de token - afficher formulaire de connexion
          showAuthSection();
          disableAllToggles();
        } else if (ageMs > ninetyDays) {
          // Token expiré mais on vérifie quand même l'abonnement
          // L'utilisateur devra peut-être se reconnecter
          verifyToken(token, data.user_email);
        } else {
          // Token valide - vérifier avec le backend
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
  }

  function showUserSection(email, subscriptionData) {
    authSection.style.display = "none";
    userSection.style.display = "block";
    userEmailSpan.textContent = email;

    // Update subscription badge
    if (subscriptionData.email_verified === false) {
      subscriptionBadge.className = "subscription-badge inactive";
      subscriptionBadge.textContent = "⚠️ Email non vérifié";
      showStatus(
        "⚠️ Veuillez vérifier votre email pour utiliser l'extension. Consultez votre profil sur le site.",
        "error"
      );
    } else if (subscriptionData.status === "error") {
      subscriptionBadge.className = "subscription-badge inactive";
      subscriptionBadge.textContent = "⚠️ Erreur";
    } else if (subscriptionData.subscription_active) {
      subscriptionBadge.className = "subscription-badge active";
      subscriptionBadge.textContent = "✓ Premium";
    } else if (subscriptionData.trial_days_remaining > 0) {
      subscriptionBadge.className = "subscription-badge trial";
      subscriptionBadge.textContent = `⏰ Essai (${subscriptionData.trial_days_remaining}j)`;
    } else {
      subscriptionBadge.className = "subscription-badge inactive";
      subscriptionBadge.textContent = "✗ Expiré";
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

  async function verifyToken(token, email) {
    try {
      const res = await fetch(API_BASE + "/api/check-subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
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
          Object.entries(toggles).forEach(([elementId, storageKey]) => {
            const element = document.getElementById(elementId);
            if (element) {
              const isOn = items[storageKey] ?? defaults[storageKey];
              renderToggle(element, isOn);
            }
          });
        });
        return;
      }

      const data = await res.json();

      // Vérifier d'abord si l'email est vérifié
      if (data.email_verified === false) {
        showUserSection(email, data);
        disableAllToggles();
        showStatus(
          "⚠️ Veuillez vérifier votre email pour utiliser l'extension. Consultez votre profil sur le site.",
          "error"
        );
        return;
      }

      if (data.subscription_active || data.trial_days_remaining > 0) {
        showUserSection(email, data);
        enableAllToggles();
        hideStatus();

        // Mettre à jour visuellement les toggles selon leur état dans le storage
        chrome.storage.local.get(Object.values(toggles), (items) => {
          Object.entries(toggles).forEach(([elementId, storageKey]) => {
            const element = document.getElementById(elementId);
            if (element) {
              const isOn = items[storageKey] ?? defaults[storageKey];
              renderToggle(element, isOn);
            }
          });
        });
      } else {
        // Abonnement vraiment expiré - déconnecter
        showAuthSection();
        disableAllToggles();
        showStatus(
          "⚠️ Votre abonnement a expiré. Veuillez renouveler.",
          "error"
        );

        // Supprimer les données de connexion
        chrome.storage.local.remove([
          "access_token",
          "access_token_stored_at",
          "user_email",
        ]);
      }
    } catch (err) {
      console.error("Token verification failed:", err);
      // En cas d'erreur, on affiche quand même l'interface
      showUserSection(email, {
        subscription_active: false,
        trial_days_remaining: 0,
        status: "error",
      });
      showStatus("⚠️ Erreur de connexion au serveur", "error");
      enableAllToggles();
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

  // Login handler - Extension does not support direct login anymore
  // Users must login via the website (Google Sign-in or Firebase email/password)
  async function handleLogin() {
    showStatus(
      "⚠️ Veuillez vous connecter via le site web (Google Sign-in)",
      "error"
    );

    // Open website for login
    chrome.tabs.create({ url: "https://mymchat.fr" });
  }

  // Logout handler
  function handleLogout() {
    chrome.storage.local.remove(
      ["access_token", "access_token_stored_at", "user_email"],
      () => {
        showAuthSection();
        disableAllToggles();
        emailInput.value = "";
        passwordInput.value = "";
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
      }
    );
  }

  // Event listeners
  loginBtn.addEventListener("click", handleLogin);
  googleSignInBtn.addEventListener("click", () => {
    // Rediriger vers le site web pour l'authentification Google
    chrome.tabs.create({
      url: "https://mymchat.fr/signin?redirect=extension",
    });
  });
  logoutBtn.addEventListener("click", handleLogout);

  // Enter key support
  emailInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      passwordInput.focus();
    }
  });

  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  });

  // Toggle handlers
  Object.entries(toggles).forEach(([elementId, storageKey]) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.addEventListener("click", async () => {
      // 🔒 Vérifier d'abord le statut de l'abonnement
      const canActivate = await checkSubscriptionBeforeToggle();
      if (!canActivate) {
        showStatus(
          "⚠️ Abonnement requis pour activer cette fonctionnalité",
          "error"
        );
        setTimeout(hideStatus, 3000);
        return;
      }

      chrome.storage.local.get([storageKey], (data) => {
        const currentVal = data[storageKey] ?? false;
        const newVal = !currentVal;
        chrome.storage.local.set({ [storageKey]: newVal }, () => {
          renderToggle(element, newVal);
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
      chrome.storage.local.get(["access_token"], async (data) => {
        if (!data.access_token) {
          resolve(false);
          return;
        }

        try {
          const res = await fetch(API_BASE + "/api/check-subscription", {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });

          if (!res.ok) {
            resolve(false);
            return;
          }

          const result = await res.json();

          // Vérifier email et subscription/trial
          const isActive =
            result.email_verified !== false &&
            (result.subscription_active || result.trial_days_remaining > 0);
          resolve(isActive);
        } catch (err) {
          console.error("Subscription check error:", err);
          resolve(false);
        }
      });
    });
  }
})();
