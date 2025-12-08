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
    // Rendre la ligne entière cliquable
    const link = row.querySelector('a[href*="/app/chat/"]');
    if (!link) return;

    // Ajouter un style pointer sur toute la ligne
    row.style.cursor = "pointer";

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
  // FETCH CONVERSATIONS FROM /APP/MYMS
  // ========================================
  async function fetchConversationsList(searchQuery = "") {
    try {
      // Construire l'URL avec ou sans paramètre de recherche
      const url = searchQuery
        ? `https://creators.mym.fans/app/myms?search=${encodeURIComponent(
            searchQuery
          )}`
        : "https://creators.mym.fans/app/myms";

      if (searchQuery) {
        console.log(`🔍 [MYM Conversations] Searching for: "${searchQuery}"`);
      } else {
        // // // console.log("🔍 [MYM Conversations] Fetching list from /app/myms...");
      }

      const response = await fetch(url, {
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
  // CREATE SEARCH BAR
  // ========================================
  function createSearchBar(onSearch) {
    const searchContainer = document.createElement("div");
    searchContainer.className = "mym-conversation-search";
    searchContainer.style.cssText = `
      padding: 10px 15px;
      border-bottom: 1px solid #2a2d3a;
    `;

    const searchWrapper = document.createElement("div");
    searchWrapper.className = "searchbar";
    searchWrapper.style.cssText = `
      position: relative;
      width: 100%;
    `;

    const searchField = document.createElement("div");
    searchField.className = "searchbar__field";
    searchField.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      background: #1a1d29;
      border-radius: 8px;
      padding: 8px 12px;
    `;

    // Icône de recherche
    const searchIcon = document.createElement("span");
    searchIcon.className = "searchbar__icon";
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.innerHTML = `
      <svg width="21" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M9.63966 3.37143C6.45395 3.37143 3.87143 5.95396 3.87143 9.13967C3.87143 12.3254 6.45395 14.9079 9.63966 14.9079C12.8254 14.9079 15.4079 12.3254 15.4079 9.13967C15.4079 5.95396 12.8254 3.37143 9.63966 3.37143ZM2.5 9.13967C2.5 5.19654 5.69653 2 9.63966 2C13.5828 2 16.7793 5.19654 16.7793 9.13967C16.7793 13.0828 13.5828 16.2793 9.63966 16.2793C5.69653 16.2793 2.5 13.0828 2.5 9.13967Z" fill="#EDEEF0"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M13.718 13.218C13.9858 12.9502 14.4199 12.9502 14.6877 13.218L18.2992 16.8294C18.5669 17.0972 18.5669 17.5314 18.2992 17.7992C18.0314 18.067 17.5972 18.067 17.3294 17.7992L13.718 14.1878C13.4502 13.92 13.4502 13.4858 13.718 13.218Z" fill="#EDEEF0"/>
      </svg>
    `;

    // Input de recherche
    const searchInput = document.createElement("input");
    searchInput.className = "input__input searchbar__input js-searchbar__input";
    searchInput.type = "search";
    searchInput.placeholder = "Rechercher un utilisateur...";
    searchInput.style.cssText = `
      flex: 1;
      background: transparent;
      border: none;
      color: #fff;
      font-size: 14px;
      outline: none;
      margin-left: 8px;
    `;

    // Bouton clear
    const clearButton = document.createElement("button");
    clearButton.className =
      "searchbar__input__clear js-searchbar__input__clear";
    clearButton.type = "button";
    clearButton.textContent = "✕";
    clearButton.style.cssText = `
      display: none;
      background: transparent;
      border: none;
      color: #888;
      cursor: pointer;
      padding: 0 5px;
      font-size: 16px;
    `;

    // Événements
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      const value = e.target.value.trim();

      // Afficher/cacher le bouton clear
      clearButton.style.display = value ? "block" : "none";

      // Debounce de 300ms
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        onSearch(value);
      }, 300);
    });

    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(searchTimeout);
        onSearch(e.target.value.trim());
      }
    });

    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      clearButton.style.display = "none";
      onSearch("");
    });

    // Assemblage
    searchField.appendChild(searchIcon);
    searchField.appendChild(searchInput);
    searchField.appendChild(clearButton);
    searchWrapper.appendChild(searchField);
    searchContainer.appendChild(searchWrapper);

    return searchContainer;
  }

  // ========================================
  // REMOVE FOOTER FROM SIDEBAR
  // ========================================
  function removeSidebarFooter() {
    const footer = document.querySelector("footer.sidebar__footer");
    if (footer) {
      // console.log(
      //   "🗑️ [MYM Conversations] Removing entire sidebar footer to save space"
      // );
      footer.remove();
    }
  }

  // ========================================
  // RENDER CONVERSATIONS LIST
  // ========================================
  function renderConversationsList(
    conversations,
    listContainer,
    isSearchResult = false
  ) {
    // Vider le conteneur
    listContainer.innerHTML = "";

    if (conversations.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.style.cssText = `
        padding: 20px;
        text-align: center;
        color: #888;
        font-size: 14px;
      `;
      emptyMessage.textContent = isSearchResult
        ? "Aucun résultat trouvé"
        : "Aucune conversation";
      listContainer.appendChild(emptyMessage);
      return;
    }

    // Ajouter les conversations
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

          // Ajouter des styles pour un cercle bien proportionné
          notesBtn.style.cssText = `
            width: 36px;
            height: 36px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
          `;

          notesBtn.innerHTML =
            '<span class="button__icon" style="font-size: 18px; line-height: 1;">📝</span>';

          // Ajouter les effets hover
          notesBtn.addEventListener("mouseenter", () => {
            notesBtn.style.background = "rgba(102, 126, 234, 0.25)";
            notesBtn.style.transform = "scale(1.1)";
            notesBtn.style.boxShadow = "0 4px 8px rgba(102, 126, 234, 0.3)";
          });

          notesBtn.addEventListener("mouseleave", () => {
            notesBtn.style.background = "";
            notesBtn.style.transform = "";
            notesBtn.style.boxShadow = "";
          });

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

      listContainer.appendChild(clonedRow);
    });

    // Scanner les badges après le rendu
    setTimeout(() => {
      if (contentAPI.badges && contentAPI.badgesEnabled) {
        contentAPI.badges.scanExistingListsForBadges();
      }
    }, 100);
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

    // Récupérer les conversations initiales
    const conversations = await fetchConversationsList();
    if (conversations.length === 0) {
      console.warn("⚠️ [MYM Conversations] No conversations found");
      return;
    }

    // Créer le conteneur principal
    const container = document.createElement("div");
    container.className = "mym-conversations-list";
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 100%;
      border-top: 1px solid #2a2d3a;
    `;

    // Créer le conteneur de la liste
    const listContainer = document.createElement("div");
    listContainer.className = "mym-conversations-list-content";
    listContainer.style.cssText = `
      overflow-y: auto;
      max-height: calc(100vh - 400px);
      padding: 10px 0;
    `;

    // Ajouter la barre de recherche
    const searchBar = createSearchBar(async (searchQuery) => {
      console.log(`🔍 [MYM Conversations] Search query: "${searchQuery}"`);

      // Afficher un loader
      listContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #888;">
          <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #667eea; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <div style="margin-top: 10px;">Recherche en cours...</div>
        </div>
      `;

      // Récupérer les résultats
      const results = await fetchConversationsList(searchQuery);

      // Afficher les résultats
      renderConversationsList(results, listContainer, !!searchQuery);
    });

    container.appendChild(searchBar);

    // Ajouter un titre
    const title = document.createElement("div");
    title.style.cssText = `
      padding: 10px 15px;
      font-weight: 600;
      color: #fff;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #2a2d3a;
    `;
    title.textContent = `Conversations (${conversations.length})`;
    container.appendChild(title);

    // Ajouter le conteneur de liste
    container.appendChild(listContainer);

    // Rendre les conversations initiales
    renderConversationsList(conversations, listContainer, false);

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

    // Ajouter l'animation de spin pour le loader
    if (!document.getElementById("mym-spin-animation")) {
      const style = document.createElement("style");
      style.id = "mym-spin-animation";
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // Attendre un peu que les stats se chargent
    setTimeout(waitForStats, 100);
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
