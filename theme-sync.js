/**
 * Theme Sync Script
 * Synchronizes theme between mymchat.fr (localStorage) and chrome.storage
 * Applied on mymchat.fr pages only
 */

(function () {
  "use strict";

  // Flag pour éviter les boucles infinies
  let isUpdatingTheme = false;

  const THEMES = {
    default: {
      primary: "#667eea",
      secondary: "#764ba2",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    dark: {
      primary: "#5f5f5fff",
      secondary: "#1d1d1dff",
      gradient: "linear-gradient(135deg, #5f5f5fff 0%, #1d1d1dff 100%)",
      background: "#0a0b0e",
      text: "#e5e7eb",
      textSecondary: "#9ca3af",
      cardBackground: "#1a1d29",
      borderColor: "#2a2d3a",
    },
  };

  /**
   * Applique le thème depuis chrome.storage (source de vérité = popup)
   */
  function applyThemeFromStorage() {
    if (isUpdatingTheme) return;

    // Priorité à chrome.storage (contrôlé par la popup)
    if (chrome && chrome.storage) {
      chrome.storage.local.get(["user_theme"], (data) => {
        const themeName = data.user_theme || localStorage.getItem("user_theme") || "default";
        const theme = THEMES[themeName] || THEMES.default;

        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEBUG) console.log("🎨 [Theme Sync] Initial theme loaded:", themeName);

        // Synchroniser vers localStorage pour React
        isUpdatingTheme = true;
        localStorage.setItem("user_theme", themeName);
        isUpdatingTheme = false;

        // Appliquer les variables CSS
        const root = document.documentElement;
        root.style.setProperty("--primary-color", theme.primary);
        root.style.setProperty("--secondary-color", theme.secondary);
        root.style.setProperty("--gradient-primary", theme.gradient);

        if (themeName === "dark") {
          root.style.setProperty("--background-color", theme.background);
          root.style.setProperty("--text-color", theme.text);
          root.style.setProperty("--text-secondary", theme.textSecondary);
          root.style.setProperty("--card-background", theme.cardBackground);
          root.style.setProperty("--border-color", theme.borderColor);
          document.body.classList.add("dark-theme");
        } else {
          root.style.setProperty("--background-color", "#f5f7fa");
          root.style.setProperty("--text-color", "#333");
          root.style.setProperty("--text-secondary", "#666");
          root.style.setProperty("--card-background", "white");
          root.style.setProperty("--border-color", "#e5e7eb");
          document.body.classList.remove("dark-theme");
        }
      });
    }
  }

  /**
   * Applique uniquement le thème (CSS) sans écrire dans le storage
   */
  function applyThemeOnly(themeName) {
    const theme = THEMES[themeName] || THEMES.default;
    
    // Appliquer les CSS variables
    const root = document.documentElement;
    root.style.setProperty("--primary-color", theme.primary);
    root.style.setProperty("--secondary-color", theme.secondary);
    root.style.setProperty("--gradient-primary", theme.gradient);

    if (themeName === "dark") {
      root.style.setProperty("--background-color", theme.background);
      root.style.setProperty("--text-color", theme.text);
      root.style.setProperty("--text-secondary", theme.textSecondary);
      root.style.setProperty("--card-background", theme.cardBackground);
      root.style.setProperty("--border-color", theme.borderColor);
      document.body.classList.add("dark-theme");
    } else {
      root.style.setProperty("--background-color", "#f5f7fa");
      root.style.setProperty("--text-color", "#333");
      root.style.setProperty("--text-secondary", "#666");
      root.style.setProperty("--card-background", "white");
      root.style.setProperty("--border-color", "#e5e7eb");
      document.body.classList.remove("dark-theme");
    }
  }

  /**
   * Intercepte les changements dans localStorage pour synchroniser
   */
  function syncAndApplyTheme(themeName) {
    if (isUpdatingTheme) return;

    if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEBUG) console.log("🎨 [Theme Sync] Theme changed in localStorage:", themeName);

    // Synchroniser vers chrome.storage
    if (chrome && chrome.storage) {
      isUpdatingTheme = true;
      chrome.storage.local.set({ user_theme: themeName }, () => {
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEBUG) console.log(`🎨 [Theme Sync] Theme "${themeName}" saved to chrome.storage`);
        isUpdatingTheme = false;
      });
    }

    // Appliquer le thème
    applyThemeOnly(themeName);
  }

  /**
   * Écoute les changements dans chrome.storage (depuis la popup)
   */
  if (chrome && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.user_theme && !isUpdatingTheme) {
        const oldTheme = changes.user_theme.oldValue;
        const newTheme = changes.user_theme.newValue;
        
        // Ne rien faire si le thème n'a pas vraiment changé
        if (newTheme && newTheme !== oldTheme) {
          if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEBUG) console.log("🎨 [Theme Sync] Theme changed from popup:", newTheme);
          
          // Mettre à jour localStorage pour React
          isUpdatingTheme = true;
          localStorage.setItem("user_theme", newTheme);
          
          // Appliquer le thème (sans réécrire dans chrome.storage)
          applyThemeOnly(newTheme);
          
          isUpdatingTheme = false;
        }
      }
    });
  }

  // Application initiale (chrome.storage → localStorage → CSS)
  applyThemeFromStorage();
})();