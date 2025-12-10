// ========================================
// MODULE: MYMS CLICKABLE ROWS
// Rend les lignes cliquables sur /app/myms
// ========================================

(function () {
  "use strict";

  // Access API utilities
  const contentAPI = window.MYM_CONTENT_API || {};
  const debounce = contentAPI.debounce || function(f, w) { return f; }; // Fallback
  const SELECTORS = contentAPI.SELECTORS || {};

  // ========================================
  // INJECT CSS FOR POINTER CURSOR
  // ========================================
  function injectStyles() {
    // Use shared injectStyles utility if available
    if (contentAPI.injectStyles) {
      contentAPI.injectStyles("mym-clickable-rows-style", `
        .page.my-myms .list__row {
          cursor: pointer !important;
        }
        .page.my-myms .list__row button,
        .page.my-myms .list__row a {
          cursor: pointer !important;
        }
      `);
    } else {
      // Fallback for standalone usage
      if (document.getElementById("mym-clickable-rows-style")) return;
      
      const style = document.createElement("style");
      style.id = "mym-clickable-rows-style";
      style.textContent = `
        .page.my-myms .list__row {
          cursor: pointer !important;
        }
        .page.my-myms .list__row button,
        .page.my-myms .list__row a {
          cursor: pointer !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ========================================
  // MAKE ROW CLICKABLE
  // ========================================
  function makeRowClickable(row) {
    // Vérifier si déjà traité
    if (row.dataset.mymClickable) return;
    row.dataset.mymClickable = "true";

    const link = row.querySelector('a[href*="/app/chat/"]');
    if (!link) return;

    // Gérer le clic sur toute la ligne
    row.addEventListener("click", (e) => {
      // Ne pas interférer avec les clics sur les boutons
      if (e.target.closest("button")) {
        return;
      }

      // Ne pas interférer avec les clics sur les liens
      if (e.target.closest("a")) {
        return;
      }

      // Sinon, rediriger vers le chat
      e.preventDefault();
      e.stopPropagation();
      window.location.href = link.href;
    });
  }

  // ========================================
  // SCAN AND MAKE ROWS CLICKABLE
  // ========================================
  function scanAndMakeRowsClickable() {
    const rows = document.querySelectorAll(".list__row");
    rows.forEach(makeRowClickable);
  }

  // ========================================
  // OBSERVE DOM CHANGES
  // ========================================
  function observeNewRows() {
    // Debounced scan to batch rapid DOM changes
    const debouncedScan = debounce(scanAndMakeRowsClickable, 200);

    const observer = new MutationObserver((mutations) => {
      let needsScan = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.classList?.contains("list__row")) {
              needsScan = true;
            } else if (node.querySelector?.(".list__row")) {
              needsScan = true;
            }
          }
        });
      });

      if (needsScan) {
        debouncedScan();
      }
    });

    // Observe page container instead of entire body for better performance
    const pageContainer = document.querySelector(".page.my-myms") || document.body;
    observer.observe(pageContainer, {
      childList: true,
      subtree: true, // Required to catch nested list rows
    });

    return observer;
  }

  // ========================================
  // INITIALIZE
  // ========================================
  function init() {
    // Vérifier qu'on est sur /app/myms
    if (!window.location.pathname.startsWith("/app/myms")) {
      return;
    }

    console.log("✅ [MYM Clickable Rows] Initializing on /app/myms");

    // Injecter les styles CSS
    injectStyles();

    // Scanner les lignes existantes
    scanAndMakeRowsClickable();

    // Observer les nouvelles lignes
    observeNewRows();
  }

  // ========================================
  // START
  // ========================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Réinitialiser lors des changements de page (navigation SPA)
  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      if (window.location.pathname.startsWith("/app/myms")) {
        setTimeout(init, 500);
      }
    }
  }, 500);
})();
