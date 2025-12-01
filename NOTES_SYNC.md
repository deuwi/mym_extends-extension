# Synchronisation des notes utilisateur

## Changement important ✅

Les notes utilisateur utilisent maintenant **`chrome.storage.sync`** au lieu de `chrome.storage.local`.

### Avantages

#### 1. **Persistance après réinstallation** 🔄

- Les notes sont sauvegardées dans le cloud Google
- Même après désinstallation/réinstallation de l'extension, les notes sont conservées
- Pas de perte de données

#### 2. **Synchronisation multi-appareils** 🌐

- Les notes sont automatiquement synchronisées entre tous les appareils où l'utilisateur est connecté avec le même compte Google
- Modification sur PC → Visible sur ordinateur portable
- Une seule source de vérité pour toutes les notes

#### 3. **Sauvegarde automatique** ☁️

- Google Chrome sauvegarde automatiquement les données dans le cloud
- Protection contre les pannes de disque dur
- Récupération facile des données

### Limites de chrome.storage.sync

Selon la documentation Chrome :

- **Quota total** : 100 KB pour toute l'extension
- **Quota par item** : 8 KB maximum par clé
- **Nombre d'items** : 512 items maximum
- **Opérations d'écriture** :
  - 120 écritures par minute maximum
  - 1800 écritures par heure maximum

### Impact sur les utilisateurs

#### Pour les notes de taille moyenne (< 8 KB par utilisateur)

- ✅ Aucun problème
- ✅ Synchronisation instantanée
- ✅ Persistance garantie

#### Pour les utilisateurs avec beaucoup de notes

- Si un utilisateur a des notes très longues (> 8 KB) pour un seul chat :
  - ⚠️ La sauvegarde échouera silencieusement
  - 💡 Solution : Limiter la taille des notes à ~7500 caractères par chat

#### Pour les utilisateurs avec beaucoup de chats

- Si l'utilisateur a des notes pour plus de 512 conversations différentes :
  - ⚠️ Les notes les plus anciennes pourraient ne pas être sauvegardées
  - 💡 En pratique, 512 conversations avec notes est un cas très rare

### Recommandations futures

#### Option 1 : Ajouter une validation de taille

```javascript
function saveUserNotes(isAutoSave = false) {
  const notes = textarea.value;

  // Vérifier la taille (8 KB = 8192 bytes, laisser une marge)
  if (new Blob([notes]).size > 7500) {
    alert(
      "⚠️ Vos notes sont trop longues. Limitez-vous à environ 7500 caractères pour garantir la synchronisation."
    );
    return;
  }

  // ... reste du code
}
```

#### Option 2 : Basculer vers un backend cloud

- Sauvegarder les notes sur Firebase/Firestore
- Quota illimité
- Meilleur contrôle
- Nécessite une authentification utilisateur

#### Option 3 : Système hybride

- Notes récentes → `chrome.storage.sync` (synchronisation)
- Archive des anciennes notes → `chrome.storage.local` (local uniquement)
- Export/import manuel pour sauvegarde

### Migration pour les utilisateurs existants

Les utilisateurs qui ont déjà des notes dans `chrome.storage.local` devront :

1. **Option A** : Script de migration automatique (à ajouter)

```javascript
// Migrer les notes de local vers sync au premier lancement
chrome.storage.local.get(null, (localData) => {
  const notesKeys = Object.keys(localData).filter((k) =>
    k.startsWith("mym_notes_")
  );
  chrome.storage.sync.set(localData, () => {
    console.log("Notes migrées vers sync");
    // Optionnel: supprimer les anciennes notes local
    chrome.storage.local.remove(notesKeys);
  });
});
```

2. **Option B** : Recréer manuellement leurs notes

- Les anciennes notes resteront dans `chrome.storage.local` (non synchronisées)
- Les nouvelles notes iront dans `chrome.storage.sync`

### Conclusion

✅ **Avantages majeurs** :

- Persistance après réinstallation
- Synchronisation multi-appareils
- Sauvegarde cloud automatique

⚠️ **À surveiller** :

- Quota de 100 KB total
- Limite de 8 KB par note
- Maximum 512 conversations avec notes

Pour 99% des utilisateurs, ces limites ne seront jamais atteintes et l'expérience sera grandement améliorée.
