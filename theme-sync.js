/**
 * Theme Sync Script
 * Synchronizes theme from extension storage to frontend (mymchat.fr)
 */

(function() {
  'use strict';

  const THEMES = {
    default: {
      name: "Violet",
      primary: "#667eea",
      secondary: "#764ba2",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    blue: {
      name: "Bleu",
      primary: "#4facfe",
      secondary: "#00f2fe",
      gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    },
    green: {
      name: "Vert",
      primary: "#43e97b",
      secondary: "#38f9d7",
      gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    },
    pink: {
      name: "Rose",
      primary: "#f857a6",
      secondary: "#ff5858",
      gradient: "linear-gradient(135deg, #f857a6 0%, #ff5858 100%)",
    },
    orange: {
      name: "Orange",
      primary: "#fa709a",
      secondary: "#fee140",
      gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    },
    dark: {
      name: "Sombre",
      primary: "#434343",
      secondary: "#000000",
      gradient: "linear-gradient(135deg, #434343 0%, #000000 100%)",
    },
  };

  function applyThemeToPage(themeName) {
    const theme = THEMES[themeName] || THEMES.default;
    
    // Écrire dans localStorage pour React
    try {
      window.localStorage.setItem("user_theme", themeName);
    } catch (e) {
      console.error("Erreur écriture localStorage:", e);
    }

    // Appliquer directement les CSS variables
    document.documentElement.style.setProperty("--gradient-primary", theme.gradient);
    document.documentElement.style.setProperty("--primary-color", theme.primary);
    document.documentElement.style.setProperty("--secondary-color", theme.secondary);

    // Déclencher événement personnalisé pour React
    window.dispatchEvent(new CustomEvent('themeChange', {
      detail: { themeName, theme }
    }));

    console.log(`🎨 [MYM Theme Sync] Thème "${themeName}" appliqué sur ${window.location.hostname}`);
  }

  // Charger et appliquer le thème au chargement
  chrome.storage.local.get(["user_theme"], (data) => {
    const themeName = data.user_theme || "default";
    applyThemeToPage(themeName);
  });

  // Écouter les changements de thème depuis la popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "applyTheme" && message.theme) {
      // Retrouver le nom du thème à partir de l'objet theme
      let themeName = "default";
      for (const [name, themeObj] of Object.entries(THEMES)) {
        if (themeObj.gradient === message.theme.gradient) {
          themeName = name;
          break;
        }
      }
      applyThemeToPage(themeName);
    }
  });

  // Écouter les changements dans chrome.storage
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.user_theme) {
      const newTheme = changes.user_theme.newValue;
      if (newTheme) {
        applyThemeToPage(newTheme);
      }
    }
  });
})();
