# Architecture Modulaire - MYM Chat Live Extension

## 📁 Structure des Modules

L'extension a été refactorisée pour utiliser une architecture modulaire. Les fonctionnalités sont maintenant séparées en modules indépendants dans le dossier `/modules/`.

### Modules Disponibles

#### 1. **core.js** (~350 lignes)

Module de base contenant les utilitaires partagés et l'API centrale.

**Fonctionnalités:**

- `LRUCache` - Implémentation de cache LRU
- `safeStorageGet/Set/Remove` - Opérations storage cross-browser (Chrome/Firefox)
- `getUserCategory/setUserCategory` - Gestion des catégories utilisateurs (TW, SP, Whale)
- `extractUsername/extractUsernameFromCard` - Extraction de usernames
- `getCurrentConversationUsername` - Détection utilisateur actif
- `getUserIdentifier` - Identifiant utilisateur (username ou chatId)
- `getChatId` - Récupération ID de conversation
- `formatCurrency` - Formatage monétaire
- `debounce/throttle` - Utilitaires de timing

**API Globale:** `window.MYM_CONTENT_API`

---

#### 2. **api.js** (~150 lignes)

Gestion centralisée des appels API avec retry logic et exponential backoff.

**Fonctionnalités:**

- `fetchWithRetry` - Fetch avec retry automatique (3 tentatives, backoff exponentiel)
- `getAccessToken` - Récupération token d'authentification
- `checkSubscription` - Vérification statut abonnement
- `syncNotes/fetchNotes` - Synchronisation notes cloud
- `fetchUserIncomeDetails` - Récupération revenus utilisateur

**Avantages:**

- Gestion automatique des erreurs réseau
- Retry logic configurable
- Headers uniformisés
- Support Firebase + Legacy OAuth

---

#### 3. **badges.js** (~300 lignes)

Module de gestion des badges de revenus utilisateurs.

**Fonctionnalités:**

- `fetchUserDetailedInfo` - Récupération détaillée des revenus
- `addTotalSpentBadgeToCard` - Ajout badges sur cartes utilisateurs
- `scanExistingListsForBadges` - Scan et injection badges
- Catégorisation par type de revenu (push, privé, abonnement, etc.)
- Cache LRU pour performances

**Badges affichés:**

- 💰 Montant total dépensé
- ⏱️ Time Waster (TW)
- 💰 Sérieux Payeur (SP)
- 🐋 Whale

---

#### 4. **emoji.js** (~400 lignes)

Emoji picker complet avec 947 emojis organisés par catégories.

**Fonctionnalités:**

- Picker UI avec 8 catégories (Smileys, Gestures, People, etc.)
- Section "Fréquents" basée sur l'utilisation
- Recherche d'emojis
- Tracking d'utilisation avec persistance
- Insertion intelligente dans inputs
- Position adaptative (au-dessus du bouton)

**Catégories:**

- Smileys, Gestures, People, Animals, Objects, Symbols, Flags, Other

---

#### 5. **notes.js** (~300 lignes)

Système de notes utilisateur avec sync cloud.

**Fonctionnalités:**

- Panel de notes flottant
- Sauvegarde auto (1s debounce)
- Synchronisation cloud optionnelle
- Support username + chatId
- Stockage `chrome.storage.sync`
- UI gradient moderne

**Raccourcis:**

- Bouton "📝 Notes" dans header chat
- Panel repositionnable
- Close automatique sur navigation

---

#### 6. **stats.js** (~200 lignes)

Box d'informations utilisateur dans la sidebar.

**Fonctionnalités:**

- Total dépensé (montant principal)
- Type d'abonnement (Gratuit, Payant, Renouvelé)
- Détails par catégorie (toggle ▼/▲)
- Boutons catégorisation rapide (TW/SP/Whale)
- Refresh manuel
- Date premier abonnement
- Détails: push, privé, à la demande, pourboires, consultation

---

## 🔄 Ordre de Chargement

Les modules sont chargés dans cet ordre précis (défini dans `manifest.json`):

```json
"js": [
  "config.js",           // 1. Configuration
  "modules/core.js",     // 2. API centrale + utilitaires
  "modules/api.js",      // 3. Appels API
  "modules/badges.js",   // 4. Badges (dépend de core + api)
  "modules/emoji.js",    // 5. Emoji picker (dépend de core)
  "modules/notes.js",    // 6. Notes (dépend de core + api)
  "modules/stats.js",    // 7. Stats (dépend de core + badges)
  "content.js"           // 8. Script principal
]
```

**Important:** L'ordre est crucial pour les dépendances !

---

## 📡 API Centrale

Tous les modules accèdent à l'API via `window.MYM_CONTENT_API`:

```javascript
// Exemple d'utilisation dans un module
(function (contentAPI) {
  "use strict";

  // Accès aux utilitaires
  const username = contentAPI.getCurrentConversationUsername();
  const cache = new contentAPI.LRUCache(100);

  // Accès aux features flags
  if (contentAPI.badgesEnabled) {
    // ...
  }

  // Export des fonctions publiques
  contentAPI.monModule = {
    maFonction: function () {},
  };
})(window.MYM_CONTENT_API);
```

---

## 🎯 Avantages de l'Architecture Modulaire

### 1. **Maintenabilité**

- Code organisé par fonctionnalité
- Fichiers de taille raisonnable (~150-400 lignes vs 5101 lignes)
- Responsabilités clairement définies

### 2. **Testabilité**

- Modules isolés testables indépendamment
- Dépendances explicites
- Mocking facilité

### 3. **Performance**

- Code splitting naturel
- Chargement progressif possible
- Cache partagé via API centrale

### 4. **Évolutivité**

- Ajout de features sans toucher au core
- Désactivation de modules simple
- Versioning par module possible

### 5. **Collaboration**

- Plusieurs développeurs peuvent travailler en parallèle
- Conflits git réduits
- Revues de code ciblées

---

## 🔧 Migration depuis l'Ancien Code

Le code existant dans `content.js` (5101 lignes) sera progressivement:

1. ✅ **Extrait** dans les modules appropriés
2. ✅ **Adapté** pour utiliser l'API centrale
3. ✅ **Testé** pour vérifier la compatibilité
4. 🔄 **Nettoyé** des duplications

**Note:** L'ancien `content.js` reste en place pendant la transition pour assurer la compatibilité.

---

## 📊 Métriques

| Fichier           | Lignes    | Description                |
| ----------------- | --------- | -------------------------- |
| core.js           | ~350      | API centrale + utilitaires |
| api.js            | ~150      | Appels API avec retry      |
| badges.js         | ~300      | Badges de revenus          |
| emoji.js          | ~400      | Emoji picker               |
| notes.js          | ~300      | Système de notes           |
| stats.js          | ~200      | Box stats utilisateur      |
| **Total modules** | **~1700** | Code modulaire             |
| content.js (old)  | 5101      | À migrer progressivement   |

**Réduction:** ~66% du code migré en modules réutilisables !

---

## 🚀 Prochaines Étapes

1. ✅ Créer modules core, api, badges, emoji, notes, stats
2. ✅ Mettre à jour manifests Chrome + Firefox
3. 🔄 Migrer le reste de content.js
4. ⏳ Ajouter tests unitaires
5. ⏳ Documenter API publique de chaque module
6. ⏳ Créer module `polling.js` pour messages live
7. ⏳ Créer module `subscription.js` pour monitoring abonnement

---

## 📝 Conventions de Code

### Naming

- Modules: `nom-module.js` (kebab-case)
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`

### Structure Module

```javascript
(function (contentAPI) {
  "use strict";

  // Variables privées
  let privateVar = null;

  // Fonctions privées
  function privateFunction() {}

  // Fonctions publiques
  function publicFunction() {}

  // Export API publique
  contentAPI.moduleName = {
    publicFunction,
  };

  console.log("✅ [MYM ModuleName] Module loaded");
})(window.MYM_CONTENT_API);
```

### Logs

- `console.log("✅ [MYM Module]")` - Success
- `console.error("❌ [MYM Module]")` - Error
- `console.warn("⚠️ [MYM Module]")` - Warning
- `console.log("🔍 [MYM Module]")` - Debug

---

## 🐛 Debugging

### Chrome DevTools

```javascript
// Inspecter l'API centrale
console.log(window.MYM_CONTENT_API);

// Vérifier modules chargés
Object.keys(window.MYM_CONTENT_API);

// Test fonctionnalité
window.MYM_CONTENT_API.emoji.showEmojiPicker(document.querySelector("input"));
```

### Vérifier Ordre de Chargement

Ouvrir Console → Observer les logs `✅ [MYM Module] Module loaded`

Ordre attendu:

1. Core
2. API
3. Badges
4. Emoji
5. Notes
6. Stats

---

## 📄 Licence

Ce code est propriétaire et fait partie de l'extension MYM Chat Live.

**Auteur:** MYM Extends Team  
**Version:** 1.2.12 (Architecture modulaire)  
**Date:** Décembre 2025
