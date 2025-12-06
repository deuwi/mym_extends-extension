# MYM Chat Live - Firefox Edition

## 🦊 Installation pour Firefox

### Option 1: Installation temporaire (développement)

1. Ouvrir Firefox
2. Aller à `about:debugging#/runtime/this-firefox`
3. Cliquer sur "Load Temporary Add-on"
4. Sélectionner le fichier `manifest.json` dans le dossier `build-firefox`

### Option 2: Build du package Firefox

```powershell
# Exécuter le script de build
.\build-firefox.ps1
```

Le script va :

- ✅ Créer le dossier `build-firefox`
- ✅ Copier tous les fichiers nécessaires
- ✅ Utiliser le manifest Firefox
- ✅ Configurer le polyfill pour la compatibilité

### Option 3: Créer un package .xpi pour distribution

```powershell
# 1. Build l'extension
.\build-firefox.ps1

# 2. Créer l'archive
cd build-firefox
Compress-Archive -Path * -DestinationPath ..\mym-chat-live-firefox.zip

# 3. Renommer en .xpi
cd ..
Move-Item mym-chat-live-firefox.zip mym-chat-live-firefox.xpi
```

## 🔧 Différences avec Chrome

### Manifest

- Ajout de `browser_specific_settings` avec l'ID Firefox
- `background.scripts` au lieu de `background.service_worker`
- Ajout explicite des icônes

### Code

- Utilisation du polyfill `browser-polyfill.js`
- Compatible avec `chrome.*` ET `browser.*` API

### Limitations Firefox

- ⚠️ Service Workers en background (MV3) supportés depuis Firefox 109
- ⚠️ Certaines API peuvent avoir des comportements légèrement différents

## 📋 Prérequis

- Firefox 109 ou supérieur
- Tous les fichiers source de l'extension Chrome

## 🚀 Publier sur Firefox Add-ons (AMO)

1. Créer un compte sur [addons.mozilla.org](https://addons.mozilla.org)
2. Aller sur [Developer Hub](https://addons.mozilla.org/developers/)
3. Cliquer "Submit a New Add-on"
4. Upload le fichier `.xpi`
5. Remplir les informations (description, captures d'écran, etc.)
6. Soumettre pour review

### Notes importantes pour AMO:

- ⚠️ Le review peut prendre 1-2 semaines
- ✅ Code source doit être lisible (pas de minification excessive)
- ✅ Permissions doivent être justifiées
- ✅ Privacy Policy requise si collecte de données

## 🧪 Tests recommandés

- [ ] Connexion via Google Sign-in
- [ ] Vérification du token et expiration
- [ ] Chat Live sur MYM.fans
- [ ] Badges de revenus
- [ ] Emoji Picker
- [ ] Notes
- [ ] Broadcast
- [ ] Licence Agence

## 🐛 Debugging

```javascript
// Dans la console Firefox
browser.runtime.getManifest(); // Vérifier le manifest
browser.storage.local.get(); // Voir le storage
```

## 📞 Support

En cas de problème spécifique à Firefox, vérifier :

1. Version de Firefox ≥ 109
2. Console d'erreurs (`Ctrl+Shift+J`)
3. Console de l'extension dans `about:debugging`
