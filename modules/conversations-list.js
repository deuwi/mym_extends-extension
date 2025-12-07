/**
 * Conversations List Module
 * Injects full conversation list in aside when viewing a chat
 */

(function (contentAPI) {
  "use strict";

  if (!contentAPI) {
    console.error("❌ [MYM Conversations] contentAPI not available");
    return;
  }

  // ========================================
  // MAKE CLONED ROW CLICKABLE
  // ========================================
  function makeClonedRowClickable(row) {
    // Désactivé : la ligne entière ne doit plus être cliquable
    // Seuls les éléments interactifs (liens, boutons) restent cliquables
    return;
  }

  // ========================================
  // FETCH CONVERSATIONS FROM /APP/MYMS
  // ========================================
  async function fetchConversationsList() {
    try {
      // // // console.log("🔍 [MYM Conversations] Fetching list from /app/myms...");

      const response = await fetch("https://creators.mym.fans/app/myms", {
        credentials: "include",
        headers: {
          Accept: "text/html",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Extraire tous les .list__row
      const rows = doc.querySelectorAll(".list__row");
      console.log(`✅ [MYM Conversations] Found ${rows.length} conversations`);

      return Array.from(rows);
    } catch (error) {
      console.error("❌ [MYM Conversations] Error fetching list:", error);
      return [];
    }
  }

  // ========================================
  // REMOVE FOOTER FROM SIDEBAR
  // ========================================
  function removeSidebarFooter() {
    const footer = document.querySelector("footer.sidebar__footer");
    if (footer) {
      console.log(
        "🗑️ [MYM Conversations] Removing entire sidebar footer to save space"
      );
      footer.remove();
    }
  }

  // ========================================
  // INJECT CONVERSATIONS IN ASIDE
  // ========================================
  async function injectConversationsInAside() {
    // Vérifier qu'on est sur une page de chat
    if (!window.location.pathname.startsWith("/app/chat/")) {
      // // // console.log("⏸️ [MYM Conversations] Not on chat page, skipping");
      return;
    }

    console.log(
      "🚀 [MYM Conversations] Injecting conversations list in aside..."
    );

    // Trouver l'aside
    const aside = document.querySelector("aside.sidebar");
    if (!aside) {
      console.warn("⚠️ [MYM Conversations] Aside not found");
      return;
    }

    // Supprimer le footer pour gagner de la place
    removeSidebarFooter();

    // Vérifier si déjà injecté
    if (aside.querySelector(".mym-conversations-list")) {
      // // // console.log("✅ [MYM Conversations] List already injected");
      return;
    }

    // Récupérer les conversations
    const conversations = await fetchConversationsList();
    if (conversations.length === 0) {
      console.warn("⚠️ [MYM Conversations] No conversations found");
      return;
    }

    // Créer le conteneur
    const container = document.createElement("div");
    container.className = "mym-conversations-list";
    container.style.cssText = `
      overflow-y: auto;
      max-height: calc(100vh - 300px);
      padding: 10px 0;
      border-top: 1px solid #2a2d3a;
      width: 100%;
    `;

    // Ajouter un titre
    const title = document.createElement("div");
    title.style.cssText = `
      padding: 10px 15px;
      font-weight: 600;
      color: #fff;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    container.appendChild(title);

    // Ajouter les conversations
    const list = document.createElement("div");
    conversations.forEach((row) => {
      // Cloner le row
      const clonedRow = row.cloneNode(true);

      // S'assurer que le lien fonctionne
      const link = clonedRow.querySelector('a[href*="/app/chat/"]');
      if (link) {
        const href = link.getAttribute("href");
        if (!href.startsWith("http")) {
          link.href = "https://creators.mym.fans" + href;
        }
      }

      // Ajouter le bouton Notes
      const rightSection = clonedRow.querySelector(".list__row__right");
      const nicknameElement = clonedRow.querySelector(
        ".nickname_profile .js-nickname-placeholder"
      );

      if (rightSection && nicknameElement && link) {
        const username = nicknameElement.textContent.trim();
        const chatId = link.getAttribute("data-id");

        // Vérifier si le bouton Notes n'existe pas déjà
        if (!rightSection.querySelector(".mym-notes-button")) {
          const notesBtn = document.createElement("button");
          notesBtn.className =
            "button button--icon button--secondary list__row__right__no-border mym-notes-button";
          notesBtn.type = "button";
          notesBtn.title = `Ouvrir les notes pour ${username}`;
          notesBtn.innerHTML =
            '<span class="button__icon" style="font-size: 20px;">📝</span>';

          notesBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (contentAPI.notes && contentAPI.notes.openNotesForUser) {
              contentAPI.notes.openNotesForUser(username, chatId);
            }
          };

          // Insérer avant le lien de navigation
          rightSection.insertBefore(notesBtn, link);
        }
      }

      // Make the cloned row clickable
      makeClonedRowClickable(clonedRow);

      list.appendChild(clonedRow);
    });

    container.appendChild(list);

    // Attendre que les stats soient injectées avant d'injecter la liste
    const waitForStats = () => {
      const statsBox = aside.querySelector(".mym-user-info-box");
      const footer = aside.querySelector(".sidebar__footer");

      if (statsBox && footer) {
        // Insérer entre stats et footer
        aside.insertBefore(container, footer);
        // // // console.log("✅ [MYM Conversations] List injected between stats and footer");
      } else if (statsBox) {
        // Insérer après la box stats
        if (statsBox.nextSibling) {
          aside.insertBefore(container, statsBox.nextSibling);
        } else {
          aside.appendChild(container);
        }
        // // // console.log("✅ [MYM Conversations] List injected after stats box");
      } else if (footer) {
        // Insérer avant le footer
        aside.insertBefore(container, footer);
        // // // console.log("✅ [MYM Conversations] List injected before footer");
      } else {
        // Fallback: chercher le header de l'aside
        const asideHeader = aside.querySelector(".sidebar__header");
        if (asideHeader && asideHeader.nextSibling) {
          aside.insertBefore(container, asideHeader.nextSibling);
        } else {
          aside.appendChild(container);
        }
        // // // console.log("✅ [MYM Conversations] List injected (stats/footer not found)");
      }
    };

    // Attendre un peu que les stats se chargent
    setTimeout(waitForStats, 100);

    // Scanner les badges après injection de la liste - augmenter le délai
    setTimeout(() => {
      if (contentAPI.badges && contentAPI.badgesEnabled) {
        // // // console.log("🔍 [MYM Conversations] Triggering badge scan after list injection");
        contentAPI.badges.scanExistingListsForBadges();
      }
    }, 500); // Augmenté de 200ms à 500ms
  }

  // ========================================
  // OBSERVER POUR DÉTECTER NAVIGATION
  // ========================================
  function observeNavigation() {
    let lastUrl = window.location.href;

    const checkUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        // // // console.log("🔄 [MYM Conversations] Navigation detected");
        lastUrl = currentUrl;
        setTimeout(injectConversationsInAside, 1000);
      }
    };

    // Observer le DOM pour détecter les changements de page (SPA)
    const observer = new MutationObserver(checkUrlChange);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Aussi surveiller les clics
    document.addEventListener("click", () => {
      setTimeout(checkUrlChange, 500);
    });

    // Et le popstate
    window.addEventListener("popstate", checkUrlChange);
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  function init() {
    // // // console.log("🚀 [MYM Conversations] Module initializing...");

    // Retirer le footer immédiatement (sur toutes les pages)
    setTimeout(removeSidebarFooter, 500);

    // Observer pour retirer le footer s'il réapparaît
    const footerObserver = new MutationObserver(() => {
      removeSidebarFooter();
    });

    const aside = document.querySelector("aside.sidebar");
    if (aside) {
      footerObserver.observe(aside, {
        childList: true,
        subtree: true,
      });
    }

    // Injecter la liste si on est sur une page de chat
    setTimeout(injectConversationsInAside, 2000);

    // Observer la navigation
    observeNavigation();
  }

  // Exposer dans l'API
  contentAPI.conversations = {
    fetchConversationsList,
    injectConversationsInAside,
    updateConversationsList: injectConversationsInAside, // Alias pour le polling
    removeSidebarFooter,
    init,
  };

  // // // console.log("✅ [MYM Conversations] Module loaded");
})(window.MYM_CONTENT_API);
