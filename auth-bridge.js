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
      
      // Envoyer le token à l'extension
      chrome.runtime.sendMessage(
        {
          type: "FIREBASE_TOKEN",
          token: event.data.token,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("❌ Auth Bridge: Error sending message:", chrome.runtime.lastError);
          } else {
            console.log("✅ Auth Bridge: Token sent to extension:", response);
          }
        }
      );
    }
  });

  // Surveiller le localStorage pour détecter quand le token est ajouté (ancien système)
  const checkInterval = setInterval(async () => {
    const token = localStorage.getItem("access_token");
    const email = localStorage.getItem("user_email");
    const userId = localStorage.getItem("user_id");

    if (token && email) {
      console.log("✅ Auth Bridge: Token detected!", { email, userId });

      // Demander au site de rafraîchir le token Firebase avant de l'envoyer
      // Cela garantit que l'extension a un token frais
      let freshToken = token;
      try {
        console.log("🔄 Auth Bridge: Requesting fresh token from page...");

        // Déclencher un événement pour demander au site de rafraîchir le token
        window.dispatchEvent(new CustomEvent("extension-request-fresh-token"));

        // Attendre un peu que le site rafraîchisse le token
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Récupérer le token possiblement rafraîchi
        freshToken = localStorage.getItem("access_token") || token;
        console.log("✅ Auth Bridge: Fresh token obtained");
      } catch (error) {
        console.warn(
          "⚠️ Auth Bridge: Could not refresh token, using existing one",
          error
        );
      }

      // Envoyer le token à l'extension via chrome.runtime
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
            console.error(
              "❌ Auth Bridge: Error sending message:",
              chrome.runtime.lastError
            );
          } else {
            console.log("✅ Auth Bridge: Token sent to extension:", response);

            // Rediriger vers une page de succès ou fermer l'onglet
            setTimeout(() => {
              window.close(); // Tenter de fermer l'onglet
            }, 1000);
          }
        }
      );

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
