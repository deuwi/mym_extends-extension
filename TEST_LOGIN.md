# Test de connexion depuis l'extension

## Étapes de débogage

### 1. Ouvrir la console de l'extension

1. Clic droit sur l'icône de l'extension → "Inspecter la popup"
2. Aller dans l'onglet "Console"

### 2. Tester la connexion

1. Entrer votre email
2. Entrer votre mot de passe
3. Cliquer sur "Se connecter"

### 3. Vérifier les erreurs dans la console

**Erreurs possibles:**

#### Erreur 401 - "Email ou mot de passe incorrect"

- Vérifier que le compte existe dans Firebase Auth
- Vérifier que le mot de passe est correct
- Si le compte a été créé via Google Sign-in, il n'a peut-être pas de mot de passe
  → Solution: Utiliser "Mot de passe oublié" sur le site pour définir un mot de passe

#### Erreur 500 - "Firebase API Key non configurée"

- `FIREBASE_WEB_API_KEY` n'est pas configuré sur Railway
- Solution: Ajouter la variable sur Railway:
  ```
  FIREBASE_WEB_API_KEY=AIzaSyB4gazd_B81C9wFHa9WT5_7TwWXPFBBHPA
  ```

#### Erreur 500 - "Utilisateur non trouvé"

- L'utilisateur existe dans Firebase Auth mais pas dans Firestore
- **Fix déployé**: Le serveur crée maintenant automatiquement l'utilisateur dans Firestore

#### Erreur CORS

- Vérifier que le serveur autorise les requêtes depuis l'extension
- Le CORS devrait déjà être configuré dans `cors_middleware.go`

### 4. Test manuel avec curl

Tester l'endpoint directement:

```powershell
$headers = @{'Content-Type'='application/json'}
$body = '{"email":"VOTRE_EMAIL","password":"VOTRE_MOT_DE_PASSE"}'
Invoke-RestMethod -Uri 'https://mymextends-backend-production.up.railway.app/auth/extension-login' -Method Post -Headers $headers -Body $body
```

**Réponse attendue:**

```json
{
  "access_token": "eyJhbGc...",
  "expires_at": 1732835123,
  "user_id": "abc123...",
  "email": "votre@email.com"
}
```

### 5. Vérifier Railway

1. Aller sur Railway Dashboard
2. Vérifier que `FIREBASE_WEB_API_KEY` est configuré
3. Vérifier les logs du déploiement
4. Attendre que le déploiement soit terminé (1-2 minutes)

### 6. Problème courant: Compte créé avec Google Sign-in

Si vous avez créé votre compte avec "Se connecter avec Google", il n'a **pas de mot de passe**.

**Solutions:**

1. Utiliser "Mot de passe oublié" sur https://mym-extends-frontend.pages.dev pour définir un mot de passe
2. OU créer un nouveau compte avec email/password via https://mym-extends-frontend.pages.dev/signin

### 7. Vérifier le stockage local de l'extension

Dans la console de l'extension:

```javascript
chrome.storage.local.get(["access_token", "user_email"], (data) => {
  console.log("Token:", data.access_token);
  console.log("Email:", data.user_email);
});
```

Si `access_token` est présent, la connexion a réussi.
