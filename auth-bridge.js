// auth-bridge.js - Bridge entre le site web et l'extension pour l'authentification Google
console.log("🌉 Auth Bridge: Initialized on", window.location.href);

// Vérifier si on est sur la page signin avec redirect=extension
const urlParams = new URLSearchParams(window.location.search);
const isExtensionLogin = urlParams.get("redirect") === "extension";

if (isExtensionLogin) {
  console.log(
    "🔵 Auth Bridge: Extension login detected, monitoring for token..."
  );

  // Écouter les messages de la page web (Firebase Token)
  window.addEventListener("message", (event) => {
    // Vérifier que le message vient bien de notre domaine
    if (event.origin !== window.location.origin) return;

    if (event.data.type === "FIREBASE_TOKEN" && event.data.token) {
      console.log("✅ Auth Bridge: Firebase token received from page!");

      // Envoyer le token + email + user_id + emailVerified à l'extension
      try {
        chrome.runtime.sendMessage(
          {
            type: "FIREBASE_TOKEN",
            token: event.data.token,
            user_email: event.data.user_email || "",
            user_id: event.data.user_id || "",
            emailVerified: event.data.emailVerified !== false, // Par défaut true si non fourni
          },
          (response) => {
            if (chrome.runtime.lastError) {
              const error = chrome.runtime.lastError.message;
              if (error.includes("Extension context invalidated")) {
                console.warn("⚠️ Extension rechargée, veuillez vous reconnecter");
                window.location.href = "https://chat4creators.fr/signin?redirect=extension";
                return;
              }
              console.error("❌ Error sending token:", error);
              return;
            }
            console.log("✅ Auth Bridge: Token sent to extension:", response);
          }
        );
      } catch (err) {
        if (err.message && err.message.includes("Extension context invalidated")) {
          console.warn("⚠️ Extension rechargée, veuillez vous reconnecter");
          window.location.href = "https://chat4creators.fr/signin?redirect=extension";
        } else {
          console.error("❌ Error sending message:", err);
        }
      }
    }
  });

  // Surveiller le localStorage pour détecter quand le token est ajouté (ancien système)
  const checkInterval = setInterval(async () => {
    const token = localStorage.getItem("access_token");
    const email = localStorage.getItem("user_email");
    const userId = localStorage.getItem("user_id");

    if (token && email) {
      console.log("✅ Auth Bridge: Token detected!", { email, userId });

      // IMPORTANT: Forcer le rafraîchissement du token Firebase pour éviter d'utiliser un token expiré
      let freshToken = token;
      try {
        console.log("🔄 Auth Bridge: Requesting fresh Firebase token...");

        // Déclencher un événement pour demander au frontend de rafraîchir le token
        window.dispatchEvent(new CustomEvent("extension-request-fresh-token"));

        // Attendre que le frontend rafraîchisse le token
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Récupérer le nouveau token
        const newToken = localStorage.getItem("access_token");
        if (newToken && newToken !== token) {
          freshToken = newToken;
          console.log(
            "✅ Auth Bridge: Fresh token obtained (different from old)"
          );
        } else {
          // Si le token n'a pas changé, vérifier s'il est expiré
          console.log(
            "⚠️ Auth Bridge: Token unchanged, checking expiration..."
          );

          // Demander au frontend de valider le token
          window.dispatchEvent(new CustomEvent("extension-validate-token"));
          await new Promise((resolve) => setTimeout(resolve, 500));

          freshToken = localStorage.getItem("access_token") || token;
          console.log("✅ Auth Bridge: Using validated token");
        }
      } catch (error) {
        console.warn(
          "⚠️ Auth Bridge: Could not refresh token, using existing one",
          error
        );
      }

      // Envoyer le token à l'extension via chrome.runtime
      try {
        chrome.runtime.sendMessage(
          {
            type: "GOOGLE_AUTH_SUCCESS",
            data: {
              access_token: freshToken,
              user_email: email,
              user_id: userId,
              access_token_stored_at: Date.now(),
            },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              const error = chrome.runtime.lastError.message;
              if (error.includes("Extension context invalidated")) {
                console.warn("⚠️ Extension rechargée, veuillez vous reconnecter");
                window.location.href = "https://chat4creators.fr/signin?redirect=extension";
                return;
              }
              console.error("❌ Auth Bridge: Error sending message:", error);
            } else {
              console.log("✅ Auth Bridge: Token sent to extension:", response);

              // Rediriger vers une page de succès ou fermer l'onglet
              setTimeout(() => {
                window.close(); // Tenter de fermer l'onglet
              }, 1000);
            }
          }
        );
      } catch (err) {
        if (err.message && err.message.includes("Extension context invalidated")) {
          console.warn("⚠️ Extension rechargée, veuillez vous reconnecter");
          window.location.href = "https://chat4creators.fr/signin?redirect=extension";
        } else {
          console.error("❌ Error sending message:", err);
        }
      }

      // Arrêter la surveillance
      clearInterval(checkInterval);
    }
  }, 100); // Vérifier toutes les 100ms

  // Timeout après 30 secondes
  setTimeout(() => {
    clearInterval(checkInterval);
    console.log("⏱️ Auth Bridge: Timeout reached, stopping monitoring");
  }, 30000);
}
