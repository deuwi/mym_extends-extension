# Changelog - MYM Chat Live Extension

## Version 2.0.2 - 8 décembre 2024

### 🔧 Améliorations de la qualité de code

#### Outils de linting et formatage

- **ESLint** configuré (`.eslintrc.js`)
  - Règle `no-console` pour éviter les console.log
  - Standards ES6+ (prefer-const, no-var, arrow-functions)
  - Configuration spécifique pour les extensions Chrome
- **Prettier** configuré (`.prettierrc.json`)
  - Formatage automatique du code
  - 100 caractères par ligne
  - Guillemets doubles, trailing commas
- **Scripts npm** :
  ```bash
  npm run lint          # Vérifier le code
  npm run lint:fix      # Corriger automatiquement
  npm run format        # Formater tous les fichiers
  ```

#### Script de migration des logs

- **Script automatisé** (`scripts/migrate-logs.js`)
  - Détecte tous les `// console.log` commentés
  - Propose le remplacement par `debugLog()`
  - Modes : preview, apply, verify
- **Guide de migration** (`docs/MIGRATION_LOGS.md`)
  - Instructions complètes
  - Exemples de migration
  - Checklist de vérification

### 📝 Documentation

- **CODE_QUALITY.md** - Guide complet des outils de qualité
- **MIGRATION_LOGS.md** - Guide de migration des logs
- **CHANGELOG.md** - Ce fichier (historique des versions)
- Mise à jour de **IMPROVEMENTS.md** avec toutes les améliorations
- Mise à jour de **CONTRIBUTING.md** avec les nouveaux standards

---

## Version 2.0.1 - 7 décembre 2024

## Version en cours - Novembre 2025

### Fonctionnalités modifiées

#### Notes utilisateur - Synchronisation cloud ☁️

- **NOUVEAU** : Les notes sont maintenant sauvegardées dans `chrome.storage.sync` au lieu de `chrome.storage.local`
- **Avantages** :
  - ✅ **Persistance après réinstallation** : Les notes ne sont plus perdues si l'extension est désinstallée
  - ✅ **Synchronisation multi-appareils** : Les notes sont automatiquement synchronisées entre tous vos appareils Chrome
  - ✅ **Sauvegarde cloud** : Google Chrome sauvegarde automatiquement vos notes dans le cloud
- **Migration automatique** : Les notes existantes sont automatiquement migrées de local vers sync au premier lancement
- **Limites** :
  - 100 KB de quota total pour toutes les notes
  - 8 KB maximum par note individuelle
  - 512 conversations avec notes maximum

#### Badges de revenus

- **Changement majeur** : Les badges affichent maintenant le **total dépensé** par chaque utilisateur depuis le début au lieu des revenus en attente
- **Affichage** : Les badges apparaissent sur :
  - La liste des discussions dans la sidebar (page chat)
  - La page principale des discussions (`/app/myms`)
  - **NOUVEAU** : Le header de la conversation (dans la zone main, à côté du pseudo de l'utilisateur)
  - Nouvelles lignes ajoutées dynamiquement (scroll infini)
- **Couleur** : Badge vert (#10b981) au lieu de bleu pour mieux représenter le total dépensé
- **Position** :
  - Badge liste : positionné directement après le nom d'utilisateur dans `.nickname_profile`
  - Badge header : positionné dans le header de conversation avec un style légèrement plus grand (12px vs 11px)

### Améliorations techniques

#### Badge dans le header de conversation

- Nouvelle fonction `addBadgeToChatHeader()` pour afficher le badge dans la zone principale
- Observer dédié pour détecter les changements de conversation et mettre à jour le badge
- Badge avec classe `.mym-total-spent-badge-header` (distinct de `.mym-total-spent-badge` pour les listes)
- Détection automatique du changement de conversation avec délai de 500ms pour assurer le chargement du DOM

#### Détection dynamique

- Ajout de la fonction `processRowForBadge()` pour traiter les nouvelles lignes ajoutées par scroll
- Le MutationObserver détecte automatiquement les nouvelles `.list__row` et ajoute les badges
- Observer supplémentaire pour le header du chat qui détecte les changements de `.nickname_profile`
- Meilleur positionnement responsive avec `line-height: 1.2`

#### Calcul du total amélioré

- La fonction `fetchUserTotalSpent()` (anciennement `fetchUserPendingIncome()`) récupère **tous** les montants depuis `/app/income-details`
- Sélecteur CSS changé : `.card-income__info--amount` au lieu de `.card-income__info--status-pending`
- Pagination automatique pour récupérer tous les paiements (pending, paid, etc.)
- Logs détaillés pour chaque page chargée
- Limite de sécurité : 100 pages maximum
- Délai de 100ms entre chaque page pour ne pas surcharger le serveur

### Migration

Pour mettre à jour l'extension :

1. Charger les nouveaux fichiers `content.js` et `background.js`
2. Les badges existants seront automatiquement remplacés
3. Le badge apparaîtra dans le header de conversation
4. Le cache `totalSpentFetched` sera réinitialisé au rechargement de la page

### Notes

- Compatible avec la version actuelle de MYM.fans (Novembre 2025)
- Nécessite l'activation de la fonctionnalité "Badges" dans les paramètres de l'extension
- Les badges sont mis à jour automatiquement lors du changement de conversation
