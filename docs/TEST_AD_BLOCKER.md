# 🧪 Guide de Test - Ad Blocker

## Test rapide après installation

### 1. Recharger l'extension

**Chrome:**
1. Aller sur `chrome://extensions/`
2. Activer le "Mode développeur" (en haut à droite)
3. Cliquer sur 🔄 (Recharger) sur l'extension MYM Chat Live

**Firefox:**
1. Aller sur `about:debugging#/runtime/this-firefox`
2. Cliquer sur "Recharger" pour l'extension

### 2. Vider le cache et recharger

**Important** : Les pubs peuvent être en cache !

1. Sur la page MYM, ouvrir les DevTools (F12)
2. Clic droit sur 🔄 (Recharger) → "Vider le cache et actualiser"
3. Ou utiliser `Ctrl+Shift+R` (rechargement forcé)

### 3. Vérifier dans la console

Ouvrir la console (F12) et chercher :

```
✅ Messages attendus:
🚫 [AdBlocker-Early] Starting early ad blocker...
✅ [AdBlocker-Early] Early blocker initialized
🚫 [AdBlocker] Initializing ad blocker...
✅ [AdBlocker] Module loaded

✅ Si des pubs sont bloquées:
🚫 [AdBlocker-Early] Blocked X ad(s)
🚫 [AdBlocker] Removed X ad(s). Total: X
```

### 4. Test manuel

1. Aller sur https://creators.mym.fans/app/chat/
2. Ouvrir une conversation
3. **Vérifier** : Aucune bannière `<details class="ad-banner">` visible
4. Scroller la page
5. **Vérifier** : Aucune pub n'apparaît même pendant le scroll

### 5. Vérifier avec les DevTools

**Méthode 1 - Éléments:**
1. F12 → Onglet "Éléments" (Elements)
2. Ctrl+F → Chercher `ad-banner`
3. **Résultat attendu** : Aucun élément trouvé OU éléments avec `display: none`

**Méthode 2 - Console:**
```javascript
// Chercher les pubs dans le DOM
document.querySelectorAll('.ad-banner, details.ad-banner').length
// Résultat attendu: 0

// Vérifier les stats
MYMAdBlocker.getStats()
// Résultat attendu: { blocked: X, lastCheck: "...", enabled: true }
```

### 6. Test de persistance

1. Ouvrir une conversation
2. Attendre 5 secondes
3. Changer d'onglet puis revenir
4. **Vérifier** : Toujours pas de pub

### 7. Test après navigation

1. Aller sur la liste des conversations
2. Cliquer sur une conversation
3. **Vérifier** : Pas de pub dans la nouvelle page
4. Utiliser le bouton "Retour"
5. **Vérifier** : Toujours pas de pub

## Debugging si les pubs apparaissent toujours

### Étape 1 : Activer le mode DEBUG

1. Ouvrir `config.js`
2. Changer `const DEBUG = false;` → `const DEBUG = true;`
3. Recharger l'extension
4. Recharger la page MYM

### Étape 2 : Vérifier les logs

Console → Chercher :
- `[AdBlocker-Early]` - Script précoce
- `[AdBlocker]` - Module principal

**Si aucun log** :
- ❌ L'extension ne se charge pas
- Vérifier manifest.json
- Vérifier erreurs console

**Si logs mais pubs visibles** :
- ❌ Les sélecteurs ne matchent pas
- Continuer étape 3

### Étape 3 : Inspecter la pub

1. Clic droit sur la pub → "Inspecter"
2. Noter la structure HTML exacte
3. Vérifier les classes et IDs
4. Copier le HTML complet

Exemple de ce qu'on cherche:
```html
<details class="ad-banner" id="...">
  <summary class="ad-banner__header">
    ...
  </summary>
</details>
```

### Étape 4 : Tester les sélecteurs manuellement

Dans la console :
```javascript
// Test 1: Sélecteur de base
document.querySelector('details.ad-banner')
// Résultat: Doit retourner l'élément pub

// Test 2: Classe générique
document.querySelector('.ad-banner')
// Résultat: Doit retourner l'élément pub

// Test 3: Vérifier le CSS
getComputedStyle(document.querySelector('.ad-banner')).display
// Résultat attendu: "none"
```

### Étape 5 : Forcer la suppression

Dans la console :
```javascript
// Suppression manuelle
document.querySelectorAll('.ad-banner, details.ad-banner').forEach(el => el.remove());

// Vérifier combien ont été supprimés
MYMAdBlocker.removeAdBanners()
// Affiche le nombre de pubs supprimées
```

### Étape 6 : Vérifier le timing

```javascript
// Vérifier quand les pubs apparaissent
const observer = new MutationObserver(() => {
  const ads = document.querySelectorAll('.ad-banner');
  if (ads.length > 0) {
    console.log('🚨 PUB DÉTECTÉE!', ads);
  }
});

observer.observe(document.body, { childList: true, subtree: true });
```

## Solutions aux problèmes courants

### Problème : Pubs apparaissent pendant 1 seconde puis disparaissent

**Cause** : CSS pas assez rapide ou spécifique  
**Solution** :
1. Vérifier que `styles/ad-blocker.css` est bien chargé
2. Vérifier que `run_at: "document_start"` dans manifest.json
3. Augmenter la spécificité CSS

### Problème : Pubs ne disparaissent jamais

**Cause** : Sélecteurs ne matchent pas  
**Solution** :
1. Inspecter la pub (voir Étape 3)
2. Ajouter les bons sélecteurs dans `ad-blocker.js` et `ad-blocker-early.js`
3. Tester manuellement les sélecteurs

### Problème : Extension ne se charge pas

**Cause** : Erreur JavaScript  
**Solution** :
1. F12 → Onglet Console
2. Chercher les erreurs en rouge
3. Vérifier manifest.json
4. Vérifier syntaxe JS dans les modules

### Problème : Pubs réapparaissent après quelques minutes

**Cause** : Injection dynamique non détectée  
**Solution** :
1. Vérifier que MutationObserver fonctionne
2. Réduire l'intervalle de vérification (déjà à 1s)
3. Ajouter plus de logging pour détecter l'injection

## Checklist finale

Avant de dire "ça marche" :

- [ ] Extension rechargée
- [ ] Cache vidé (Ctrl+Shift+R)
- [ ] Console ouverte (F12)
- [ ] Logs `[AdBlocker]` visibles
- [ ] Aucune pub visible sur la page
- [ ] `MYMAdBlocker.getStats().blocked > 0`
- [ ] Test après navigation
- [ ] Test après changement d'onglet
- [ ] Test après scroll
- [ ] Pas d'erreurs dans la console

## Contact

Si les pubs apparaissent toujours après tous ces tests :

1. Prendre un screenshot de la pub
2. Copier le HTML de la pub (Inspecter → Copier HTML externe)
3. Copier les logs console
4. Ouvrir un issue GitHub avec ces informations

---

**Date** : 8 décembre 2024  
**Version** : 2.0.2  
**Module** : Ad Blocker
