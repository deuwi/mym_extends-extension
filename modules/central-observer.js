/**
 * Central Observer Module
 * Single MutationObserver that dispatches to all modules
 * Reduces overhead from 15+ observers to 1
 */

(function (contentAPI) {
  "use strict";

  if (!contentAPI) {
    console.error("❌ [Central Observer] contentAPI not available");
    return;
  }

  // Sélecteurs groupés par zone d'intérêt
  const WATCH_ZONES = {
    // Zone conversations list (sidebar)
    conversationsList: {
      selectors: [".list__row", ".discussions__chats", ".sidebar__footer__list"],
      throttle: 500, // ms
    },
    // Zone messages chat
    messagesArea: {
      selectors: [".js-message-form", ".message", ".messages", ".chat-input__input"],
      throttle: 300,
    },
    // Zone navigation/aside
    navigationArea: {
      selectors: ["aside.sidebar", ".sidebar__footer", ".main", ".content-body"],
      throttle: 1000,
    },
    // Zone notes
    notesArea: {
      selectors: ['[data-username]', '.user-info', '.chat-header'],
      throttle: 500,
    },
    // Zone inputs (emoji, shortcuts)
    inputsArea: {
      selectors: ['textarea', 'input[type="text"]', '.input__field'],
      throttle: 400,
    },
  };

  // Queue de callbacks par zone
  const zoneCallbacks = {
    conversationsList: [],
    messagesArea: [],
    navigationArea: [],
    notesArea: [],
    inputsArea: [],
  };

  // Dernière exécution par zone (pour throttling)
  const lastExecution = {};

  /**
   * Enregistrer un callback pour une zone
   * @param {string} zone - Nom de la zone à observer
   * @param {Function} callback - Fonction à exécuter quand la zone change
   * @returns {Function} Fonction pour désinscrire le callback
   */
  function registerCallback(zone, callback) {
    if (!zoneCallbacks[zone]) {
      console.warn(`⚠️ [Central Observer] Unknown zone: ${zone}`);
      return () => {};
    }
    
    zoneCallbacks[zone].push(callback);
    
    // Retourner une fonction pour se désinscrire
    return () => {
      const index = zoneCallbacks[zone].indexOf(callback);
      if (index > -1) {
        zoneCallbacks[zone].splice(index, 1);
      }
    };
  }

  /**
   * Vérifier si une mutation concerne une zone
   * @param {MutationRecord} mutation - Mutation à analyser
   * @param {string} zone - Zone à vérifier
   * @returns {boolean}
   */
  function mutationAffectsZone(mutation, zone) {
    const config = WATCH_ZONES[zone];
    if (!config) return false;

    // Vérifier les noeuds ajoutés
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      
      for (const selector of config.selectors) {
        if (node.matches && node.matches(selector)) return true;
        if (node.querySelector && node.querySelector(selector)) return true;
      }
    }

    // Vérifier les noeuds retirés
    for (const node of mutation.removedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      
      for (const selector of config.selectors) {
        if (node.matches && node.matches(selector)) return true;
        if (node.querySelector && node.querySelector(selector)) return true;
      }
    }

    // Vérifier les attributs modifiés
    if (mutation.type === "attributes" && mutation.target.matches) {
      for (const selector of config.selectors) {
        if (mutation.target.matches(selector)) return true;
      }
    }

    return false;
  }

  /**
   * Exécuter les callbacks d'une zone avec throttling
   * @param {string} zone - Zone dont exécuter les callbacks
   */
  function executeZoneCallbacks(zone) {
    const config = WATCH_ZONES[zone];
    const now = Date.now();
    
    // Throttling
    if (lastExecution[zone] && now - lastExecution[zone] < config.throttle) {
      return;
    }
    
    lastExecution[zone] = now;
    
    // Exécuter tous les callbacks de cette zone
    const callbacks = zoneCallbacks[zone];
    if (callbacks.length === 0) return;
    
    callbacks.forEach(callback => {
      try {
        callback();
      } catch (err) {
        console.error(`❌ [Central Observer] Error in ${zone} callback:`, err);
      }
    });
  }

  /**
   * Observer central unique
   */
  let centralObserver = null;
  let isObserving = false;

  function startCentralObserver() {
    if (centralObserver) {
      console.warn("⚠️ [Central Observer] Already running");
      return;
    }

    centralObserver = new MutationObserver((mutations) => {
      const affectedZones = new Set();

      // Déterminer quelles zones sont affectées
      for (const mutation of mutations) {
        for (const zone in WATCH_ZONES) {
          if (mutationAffectsZone(mutation, zone)) {
            affectedZones.add(zone);
          }
        }
      }

      // Exécuter les callbacks des zones affectées
      affectedZones.forEach(zone => executeZoneCallbacks(zone));
    });

    // Observer tout le document avec options optimisées
    centralObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-username", "data-id", "href"], // Seulement les attributs pertinents
      characterData: false, // Ignorer les changements de texte
    });

    isObserving = true;
  }

  function stopCentralObserver() {
    if (centralObserver) {
      centralObserver.disconnect();
      centralObserver = null;
      isObserving = false;
      console.log("🛑 [Central Observer] Stopped");
    }
  }

  function isRunning() {
    return isObserving;
  }

  /**
   * Obtenir les statistiques d'utilisation
   */
  function getStats() {
    const stats = {};
    for (const zone in zoneCallbacks) {
      stats[zone] = {
        callbacks: zoneCallbacks[zone].length,
        lastExecution: lastExecution[zone] || null,
        throttle: WATCH_ZONES[zone].throttle,
      };
    }
    return stats;
  }

  // Exposer l'API
  contentAPI.centralObserver = {
    start: startCentralObserver,
    stop: stopCentralObserver,
    register: registerCallback,
    isRunning: isRunning,
    getStats: getStats,
  };
})(window.MYM_CONTENT_API);
