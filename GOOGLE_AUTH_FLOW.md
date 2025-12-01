# Flux d'authentification Google pour l'extension Chrome

## Architecture

L'extension Chrome ne peut pas utiliser directement Firebase SDK (OAuth popup bloqué), donc on utilise un flux indirect via le site web.

## Flux complet

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Utilisateur clique "Continuer avec Google" dans l'extension │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Extension ouvre un nouvel onglet:                            │
│    https://mym-extends-frontend.pages.dev/signin?redirect=ext.. │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Page Signin détecte le paramètre redirect=extension          │
│    - Lance l'authentification Google (Firebase SDK)             │
│    - Popup Google s'ouvre normalement (pas dans extension)      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Après succès Google:                                          │
│    - Backend vérifie le token Firebase                          │
│    - Retourne un JWT access_token                               │
│    - Frontend stocke dans localStorage                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Content script auth-bridge.js détecte le token:              │
│    - Surveille localStorage.getItem('access_token')             │
│    - Envoie message à background.js via chrome.runtime          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Background.js reçoit le message GOOGLE_AUTH_SUCCESS:         │
│    - Stocke le token dans chrome.storage.local                  │
│    - Vérifie le statut d'abonnement                             │
│    - Affiche notification de succès                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Popup.js écoute les changements de storage:                  │
│    - Détecte le nouveau token via chrome.storage.onChanged      │
│    - Rafraîchit l'UI automatiquement                            │
│    - Affiche l'état authentifié                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Fichiers impliqués

### Extension

- **popup.js**: Bouton Google + écoute changements storage
- **auth-bridge.js**: Content script sur le site web qui détecte le token
- **background.js**: Reçoit le token et le stocke
- **manifest.json**: Permissions pour le site web

### Frontend

- **Signin.tsx**: Détecte `redirect=extension`, affiche message succès

### Backend

- **auth_handlers_full.go**: Endpoint `/auth/firebase` pour vérifier le token Google

## Test manuel

1. Charger l'extension (non packagée)
2. Cliquer sur "Continuer avec Google"
3. Se connecter avec Google dans le nouvel onglet
4. Vérifier que la page affiche "Connexion réussie ✅"
5. Vérifier que le popup de l'extension s'est mis à jour automatiquement
6. Vérifier que les toggles sont maintenant activables

## Debug

### Console extension (popup)

```javascript
// Vérifier le token stocké
chrome.storage.local.get(["access_token", "user_email"], console.log);
```

### Console site web

```javascript
// Vérifier le localStorage
console.log(localStorage.getItem("access_token"));
```

### Console background script

1. Aller dans `chrome://extensions`
2. Cliquer sur "Inspect views: background page"
3. Vérifier les logs du message GOOGLE_AUTH_SUCCESS
