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

  // Flag pour éviter les injections multiples
  let isInjecting = false;
  let lastInjectionTime = 0;
  const INJECTION_COOLDOWN = 2000; // 2 secondes entre chaque injection

  // Use shared utilities from API
  const debounce = contentAPI.debounce;
  const SELECTORS = contentAPI.SELECTORS;
  const CleanupManager = contentAPI.CleanupManager;

  // Cleanup tracking
  let refreshInterval = null;
  let urlObserver = null;
  let footerObserver = null;

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
        if (APP_CONFIG.DEBUG) console.log(`🔍 [MYM Conversations] Searching for: "${searchQuery}"`);
      } else {
        if (APP_CONFIG.DEBUG) console.log("🔍 [MYM Conversations] Fetching list from /app/myms...");
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

      return Array.from(rows);
    } catch (error) {
      // Erreur fetch silencieuse - peut arriver en cas de problème réseau temporaire
      // La liste sera rechargée au prochain intervalle (30s)
      // console.error("❌ [MYM Conversations] Error fetching list:", error);
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
    
    // Créer le SVG de manière sécurisée
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "21");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 21 20");
    svg.setAttribute("fill", "none");
    
    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("fill-rule", "evenodd");
    path1.setAttribute("clip-rule", "evenodd");
    path1.setAttribute("d", "M9.63966 3.37143C6.45395 3.37143 3.87143 5.95396 3.87143 9.13967C3.87143 12.3254 6.45395 14.9079 9.63966 14.9079C12.8254 14.9079 15.4079 12.3254 15.4079 9.13967C15.4079 5.95396 12.8254 3.37143 9.63966 3.37143ZM2.5 9.13967C2.5 5.19654 5.69653 2 9.63966 2C13.5828 2 16.7793 5.19654 16.7793 9.13967C16.7793 13.0828 13.5828 16.2793 9.63966 16.2793C5.69653 16.2793 2.5 13.0828 2.5 9.13967Z");
    path1.setAttribute("fill", "#EDEEF0");
    
    const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path2.setAttribute("fill-rule", "evenodd");
    path2.setAttribute("clip-rule", "evenodd");
    path2.setAttribute("d", "M13.718 13.218C13.9858 12.9502 14.4199 12.9502 14.6877 13.218L18.2992 16.8294C18.5669 17.0972 18.5669 17.5314 18.2992 17.7992C18.0314 18.067 17.5972 18.067 17.3294 17.7992L13.718 14.1878C13.4502 13.92 13.4502 13.4858 13.718 13.218Z");
    path2.setAttribute("fill", "#EDEEF0");
    
    svg.appendChild(path1);
    svg.appendChild(path2);
    searchIcon.appendChild(svg);

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
      if (APP_CONFIG.DEBUG) console.log("🗑️ [MYM Conversations] Removing entire sidebar footer to save space");
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
    // Si c'est une recherche, vider complètement
    if (isSearchResult) {
      listContainer.innerHTML = "";
    }

    if (conversations.length === 0) {
      listContainer.innerHTML = "";
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

    // Créer un Set des IDs de conversations fetchées
    const fetchedChatIds = new Set();
    conversations.forEach(row => {
      const link = row.querySelector('a[href*="/app/chat/"]');
      if (link) {
        const href = link.getAttribute("href");
        const match = href?.match(/\/app\/chat\/(\d+)/);
        if (match) {
          fetchedChatIds.add(match[1]);
        }
      }
    });

    // Récupérer les IDs des conversations déjà affichées
    const existingRows = listContainer.querySelectorAll('.list__row');
    const existingChatIds = new Set();
    
    existingRows.forEach(row => {
      const link = row.querySelector('a[href*="/app/chat/"]');
      if (link) {
        const href = link.getAttribute("href") || link.href;
        const match = href?.match(/\/app\/chat\/(\d+)/);
        if (match) {
          const chatId = match[1];
          existingChatIds.add(chatId);
          
          // Si la conversation n'est plus dans la liste fetchée, la retirer
          if (!fetchedChatIds.has(chatId) && !isSearchResult) {
            row.remove();
          }
        }
      }
    });

    let newConversationsAdded = 0;

    // Parcourir les conversations en ordre inverse pour que les plus récentes soient en haut
    for (let i = conversations.length - 1; i >= 0; i--) {
      const row = conversations[i];
      const link = row.querySelector('a[href*="/app/chat/"]');
      if (!link) continue;

      const href = link.getAttribute("href");
      const match = href?.match(/\/app\/chat\/(\d+)/);
      if (!match) continue;

      const chatId = match[1];

      // Si la conversation existe déjà, ne pas la réinjecter
      if (existingChatIds.has(chatId) && !isSearchResult) {
        continue;
      }

      // Cloner le row
      const clonedRow = row.cloneNode(true);

      // S'assurer que le lien fonctionne
      const clonedLink = clonedRow.querySelector('a[href*="/app/chat/"]');
      if (clonedLink) {
        const clonedHref = clonedLink.getAttribute("href");
        if (!clonedHref.startsWith("http")) {
          clonedLink.href = "https://creators.mym.fans" + clonedHref;
        }
      }

      // Ajouter le bouton Notes
      const rightSection = clonedRow.querySelector(".list__row__right");
      const nicknameElement = clonedRow.querySelector(
        ".nickname_profile .js-nickname-placeholder"
      );

      if (rightSection && nicknameElement && clonedLink) {
        const username = nicknameElement.textContent.trim();

        // Vérifier si le bouton Notes n'existe pas déjà
        if (!rightSection.querySelector(".mym-notes-button")) {
          const notesBtn = document.createElement("button");
          notesBtn.className =
            "button mym-notes-button";
          notesBtn.type = "button";
          notesBtn.title = `Ouvrir les notes pour ${username}`;

          // Ajouter des styles pour un cercle bien proportionné
          notesBtn.style.cssText = `
            min-width: 36px;
            min-height: 36px;
            width: 36px;
            height: 100%;
            padding: 0;
            margin-left: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            border: none !important;
            border-radius:var(--mym-border-radius-circle, 10px);
          `;

          notesBtn.textContent = "📝";

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
          rightSection.insertBefore(notesBtn, clonedLink);
        }
      }

      // Make the cloned row clickable
      makeClonedRowClickable(clonedRow);

      // Insérer au début de la liste (nouvelles conversations en haut)
      if (listContainer.firstChild) {
        listContainer.insertBefore(clonedRow, listContainer.firstChild);
      } else {
        listContainer.appendChild(clonedRow);
      }
      
      newConversationsAdded++;
    }

    // Log du nombre de nouvelles conversations ajoutées
    if (newConversationsAdded > 0 && !isSearchResult) {
      if (APP_CONFIG.DEBUG) console.log(`✨ [MYM Conversations] ${newConversationsAdded} nouvelle(s) conversation(s) ajoutée(s)`);
    }

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
      return;
    }

    // Empêcher les injections multiples simultanées
    const now = Date.now();
    if (isInjecting || (now - lastInjectionTime < INJECTION_COOLDOWN)) {
      return;
    }

    isInjecting = true;

    try {
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
        return;
      }

    // Créer le conteneur principal avec loader
    const container = document.createElement("div");
    container.className = "mym-conversations-list";
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 100%;
      border-top: 1px solid #2a2d3a;
    `;

    // Injecter le loader immédiatement
    container.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #888;">
        <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid #667eea; border-top-color: transparent; border-radius: 50%; animation: mym-spin 0.8s linear infinite;"></div>
        <div style="margin-top: 15px; font-size: 14px; color: #aaa;">Chargement des conversations...</div>
      </div>
    `;

    // Ajouter le conteneur avec loader au DOM immédiatement
    const footer = aside.querySelector(".sidebar__footer");
    if (footer) {
      aside.insertBefore(container, footer);
    } else {
      aside.appendChild(container);
    }

    // Ajouter l'animation de spin si pas déjà présente
    if (!document.getElementById("mym-spin-animation")) {
      const style = document.createElement("style");
      style.id = "mym-spin-animation";
      style.textContent = `
        @keyframes mym-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // Récupérer les conversations
    const conversations = await fetchConversationsList();
    if (conversations.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #888;">
          <div style="font-size: 32px; margin-bottom: 10px;">💬</div>
          <div style="font-size: 14px;">Aucune conversation trouvée</div>
        </div>
      `;
      return;
    }

    // Vider le conteneur et reconstruire avec les données
    container.innerHTML = '';
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
      overflow-x: hidden;
      max-height: calc(100vh - 400px);
      padding: 10px 0;
      direction: rtl;
      scrollbar-width: thin;
      scrollbar-color: linear-gradient(135deg, #667eea 0%, #764ba2 100%) #1a1d2e;
    `;
    
    // Ajouter les styles de scrollbar pour WebKit (Chrome, Edge, Safari)
    contentAPI.injectStyles('mym-conversations-scrollbar-style', `
      .mym-conversations-list-content {
        direction: rtl;
      }
      .mym-conversations-list-content > * {
        direction: ltr;
      }
      .mym-conversations-list-content::-webkit-scrollbar {
        width: 8px;
      }
      .mym-conversations-list-content::-webkit-scrollbar-track {
        background: #1a1d2e;
        border-radius: 4px;
      }
      .mym-conversations-list-content::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 4px;
        transition: all 0.2s;
      }
      .mym-conversations-list-content::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
        box-shadow: 0 0 6px rgba(102, 126, 234, 0.5);
      }
    `);

    // Ajouter la barre de recherche
    const searchBar = createSearchBar(async (searchQuery) => {
      console.log(`🔍 [MYM Conversations] Search query: "${searchQuery}"`);

      // Afficher un loader
      listContainer.innerHTML = `
        <div style="padding: 30px 20px; text-align: center; color: #888;">
          <div style="display: inline-block; width: 28px; height: 28px; border: 3px solid #667eea; border-top-color: transparent; border-radius: 50%; animation: mym-spin 0.8s linear infinite;"></div>
          <div style="margin-top: 12px; font-size: 13px; color: #aaa;">Recherche en cours...</div>
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
    } finally {
      isInjecting = false;
      lastInjectionTime = Date.now();
    }
  }

  // ========================================
  // OBSERVER POUR DÉTECTER NAVIGATION - UTILISE CENTRAL OBSERVER
  // ========================================
  function observeNavigation() {
    let lastUrl = window.location.href;

    const checkUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        if (APP_CONFIG.DEBUG) console.log("🔄 [MYM Conversations] Navigation detected");
        lastUrl = currentUrl;
        setTimeout(injectConversationsInAside, 1000);
      }
    };

    // Utiliser l'observer central au lieu de créer un nouveau MutationObserver
    if (contentAPI.centralObserver) {
      contentAPI.centralObserver.register("navigationArea", checkUrlChange);
      if (APP_CONFIG.DEBUG) console.log("✅ [MYM Conversations] Registered with central observer (navigationArea)");
    } else {
      // Fallback si central observer pas disponible (ne devrait pas arriver)
      console.warn("⚠️ [MYM Conversations] Central observer not available, using fallback");
      const debouncedCheckUrl = debounce(checkUrlChange, 300);
      const observer = new MutationObserver(debouncedCheckUrl);
      observer.observe(document.body, {
        childList: true,
        subtree: false,
      });
    }

    // Aussi surveiller les clics avec debounce (using CleanupManager)
    const debouncedClickCheck = debounce(checkUrlChange, 500);
    CleanupManager.registerListener(document, "click", debouncedClickCheck);

    // Et le popstate (pas de debounce pour event navigateur) (using CleanupManager)
    CleanupManager.registerListener(window, "popstate", checkUrlChange);
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  function init() {
    if (APP_CONFIG.DEBUG) console.log("🚀 [MYM Conversations] Module initializing...");

    // Retirer le footer immédiatement (sur toutes les pages)
    setTimeout(removeSidebarFooter, 500);

    // Observer pour retirer le footer s'il réapparaît - utiliser central observer
    if (contentAPI.centralObserver) {
      contentAPI.centralObserver.register("navigationArea", removeSidebarFooter);
      if (APP_CONFIG.DEBUG) console.log("✅ [MYM Conversations] Footer removal registered with central observer");
    } else {
      // Fallback si central observer pas disponible
      console.warn("⚠️ [MYM Conversations] Central observer not available for footer removal, using fallback");
      const debouncedRemoveFooter = debounce(removeSidebarFooter, 200);
      const footerObserver = new MutationObserver(debouncedRemoveFooter);
      const aside = document.querySelector("aside.sidebar");
      if (aside) {
        footerObserver.observe(aside, {
          childList: true,
          subtree: false,
        });
      }
    }

    // Injecter la liste si on est sur une page de chat
    setTimeout(injectConversationsInAside, 2000);

    // Observer la navigation
    observeNavigation();
  }

  // ========================================
  // AUTO-REFRESH CONVERSATIONS LIST
  // ========================================
  async function refreshConversationsList() {
    const listContainer = document.querySelector(".mym-conversations-list-content");
    const searchInput = document.querySelector(".mym-conversation-search input");
    
    if (!listContainer) {
      return; // Liste pas encore injectée
    }

    // Récupérer la valeur de recherche actuelle
    const searchQuery = searchInput ? searchInput.value.trim() : "";

    try {
      // Récupérer les conversations à jour
      const conversations = await fetchConversationsList(searchQuery);
      
      // Re-rendre la liste (injecte uniquement les nouvelles si pas de recherche)
      renderConversationsList(conversations, listContainer, searchQuery !== "");
      
      // Mettre à jour le compteur dans le titre
      const title = document.querySelector(".mym-conversations-list > div:nth-child(2)");
      if (title && !searchQuery) {
        title.textContent = `Conversations (${conversations.length})`;
      }
    } catch (error) {
      console.error("❌ [MYM Conversations] Error refreshing list:", error);
    }
  }

  /**
   * Re-inject notes buttons in existing conversation list (used when re-enabling notes)
   */
  function reinjectNotesButtons() {
    if (!contentAPI.notesEnabled) return;

    const listContainer = document.querySelector(".mym-conversations-list-content");
    if (!listContainer) return;

    const rows = listContainer.querySelectorAll(".list__row");
    
    rows.forEach((row) => {
      const rightSection = row.querySelector(".list__row__right");
      const nicknameElement = row.querySelector(".nickname_profile .js-nickname-placeholder");
      const chatLink = row.querySelector('a[href*="/app/chat/"]');
      
      if (!rightSection || !nicknameElement || !chatLink) return;
      
      // Skip if button already exists
      if (rightSection.querySelector(".mym-notes-button")) return;
      
      const username = nicknameElement.textContent.trim();
      const chatId = chatLink.getAttribute("data-id");
      
      // Create notes button
      const notesBtn = document.createElement("button");
      notesBtn.className = "button button--icon button--secondary list__row__right__no-border mym-notes-button";
      notesBtn.type = "button";
      notesBtn.title = `Ouvrir les notes pour ${username}`;
      notesBtn.style.cssText = `
        width: 36px;
        height: 36px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s;
        border: none !important;
      `;
      notesBtn.textContent = "📝";

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

      rightSection.insertBefore(notesBtn, chatLink);
    });
  }

  // Rafraîchir toutes les 30 secondes (avec cleanup manager)
  if (refreshInterval) {
    CleanupManager.clearInterval(refreshInterval);
  }
  refreshInterval = CleanupManager.registerInterval(refreshConversationsList, 30000);

  // Cleanup function for this module
  function cleanup() {
    if (refreshInterval) {
      CleanupManager.clearInterval(refreshInterval);
      refreshInterval = null;
    }
    if (urlObserver) {
      CleanupManager.disconnectObserver(urlObserver);
      urlObserver = null;
    }
    if (footerObserver) {
      CleanupManager.disconnectObserver(footerObserver);
      footerObserver = null;
    }
  }

  // Exposer dans l'API
  contentAPI.conversations = {
    fetchConversationsList,
    injectConversationsInAside,
    updateConversationsList: refreshConversationsList, // Rafraîchir la liste existante
    refreshConversationsList,
    removeSidebarFooter,
    reinjectNotesButtons,
    cleanup,
    init,
  };

  if (APP_CONFIG.DEBUG) console.log("✅ [MYM Conversations] Module loaded");
})(window.MYM_CONTENT_API);
