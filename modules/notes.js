// notes.js - Module pour la gestion des notes utilisateur
(function (contentAPI) {
  "use strict";

  let currentChatIdForNotes = null;
  let notesAutoSaveTimeout = null;

  // Use shared utilities from API
  const debounce = contentAPI.debounce;
  const SELECTORS = contentAPI.SELECTORS;

  /**
   * Inject notes button in user list rows on /app/myms page
   */
  function injectNotesButtonsInList() {
    if (window.location.pathname !== "/app/myms") return;

    const userRows = document.querySelectorAll(".page.my-myms .list__row");
    // console.log(
    //   `📝 [MYM Notes] Found ${userRows.length} user rows on /app/myms`
    // );

    listRows.forEach((row) => {
      const rightSection = row.querySelector(".list__row__right");
      if (!rightSection) return;

      // Check if button already exists
      if (rightSection.querySelector(".mym-notes-button")) return;

      // Get username from the row
      const nicknameElement = row.querySelector(
        ".nickname_profile .js-nickname-placeholder"
      );
      if (!nicknameElement) return;

      const username = nicknameElement.textContent.trim();

      // Get chat ID from the link
      const chatLink = row.querySelector("a[data-id]");
      if (!chatLink) return;

      const chatId = chatLink.getAttribute("data-id");

      // Create notes button
      const notesBtn = document.createElement("button");
      notesBtn.className =
        "button button--icon button--secondary list__row__right__no-border mym-notes-button";
      notesBtn.type = "button";
      notesBtn.title = `Ouvrir les notes pour ${username}`;
      notesBtn.textContent = "📝";

      notesBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openNotesForUser(username, chatId);
      };

      // Insert before the arrow link
      rightSection.insertBefore(notesBtn, chatLink);
    });
  }

  /**
   * Open notes panel for a specific user
   */
  function openNotesForUser(username, chatId) {
    currentChatIdForNotes = chatId;
    // Use username format for consistent storage
    const user = { username, chatId, type: "username" };

    // Remove existing panel if any
    const existingPanel = document.getElementById("mym-notes-panel");
    if (existingPanel) existingPanel.remove();

    // Create new panel
    createNotesPanelForUser(user);
  }

  /**
   * Create notes panel UI
   */
  function createNotesPanel() {
    if (document.getElementById("mym-notes-panel")) return;

    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        alert(
          "⚠️ Extension rechargée. Veuillez rafraîchir la page pour utiliser les notes."
        );
        return;
      }
      chrome.storage.sync.get(["test"], () => {});
    } catch (error) {
      alert(
        "⚠️ Extension rechargée. Veuillez rafraîchir la page pour utiliser les notes."
      );
      return;
    }

    const user = contentAPI.getUserIdentifier();
    createNotesPanelForUser(user);
  }

  /**
   * Create notes panel for a specific user
   */
  function createNotesPanelForUser(user) {
    if (document.getElementById("mym-notes-panel")) return;

    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        alert(
          "⚠️ Extension rechargée. Veuillez rafraîchir la page pour utiliser les notes."
        );
        return;
      }
      chrome.storage.sync.get(["test"], () => {});
    } catch (error) {
      alert(
        "⚠️ Extension rechargée. Veuillez rafraîchir la page pour utiliser les notes."
      );
      return;
    }

    const panel = document.createElement("div");
    panel.id = "mym-notes-panel";
    panel.style.cssText = `
      position: fixed;
      right: 20px;
      top: 80px;
      width: 320px;
      background: ${getComputedStyle(document.documentElement).getPropertyValue('--mym-theme-gradient').trim() || `linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%)`};
      border: none;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 9999;
      padding: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    `;

    const title = document.createElement("h3");
    title.textContent = "Notes pour: " + user.username;
    title.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: white;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: white;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
    `;
    closeBtn.onmouseenter = () =>
      (closeBtn.style.background = "rgba(255, 255, 255, 0.2)");
    closeBtn.onmouseleave = () =>
      (closeBtn.style.background = "rgba(255, 255, 255, 0.1)");
    closeBtn.onclick = () => {
      saveNotes(user).finally(() => panel.remove());
    };

    header.appendChild(title);
    header.appendChild(closeBtn);

    const textarea = document.createElement("textarea");
    textarea.id = "mym-notes-textarea";
    textarea.placeholder = "Écrivez vos notes ici...";
    textarea.style.cssText = `
      width: 100%;
      height: 200px;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      resize: vertical;
      background: white;
      color: #333;
      margin-bottom: 12px;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    `;

    // Templates section
    const templatesContainer = document.createElement("div");
    templatesContainer.style.cssText = `
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    `;

    const templatesHeader = document.createElement("div");
    templatesHeader.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    const templatesTitle = document.createElement("div");
    templatesTitle.textContent = "📋 Templates rapides";
    templatesTitle.style.cssText = `
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    `;

    const editTemplatesBtn = document.createElement("button");
    editTemplatesBtn.textContent = "⚙️ Éditer";
    editTemplatesBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.15);
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    `;
    editTemplatesBtn.onmouseenter = () => {
      editTemplatesBtn.style.background = "rgba(255, 255, 255, 0.25)";
    };
    editTemplatesBtn.onmouseleave = () => {
      editTemplatesBtn.style.background = "rgba(255, 255, 255, 0.15)";
    };
    editTemplatesBtn.onclick = () => openTemplateEditor();

    templatesHeader.appendChild(templatesTitle);
    templatesHeader.appendChild(editTemplatesBtn);

    const templatesGrid = document.createElement("div");
    templatesGrid.id = "mym-templates-grid";
    templatesGrid.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    `;

    templatesContainer.appendChild(templatesHeader);
    templatesContainer.appendChild(templatesGrid);

    panel.appendChild(header);
    panel.appendChild(textarea);
    panel.appendChild(templatesContainer);
    document.body.appendChild(panel);

    loadNotes(user);
    loadTemplates();

    textarea.addEventListener("input", () => {
      clearTimeout(notesAutoSaveTimeout);
      notesAutoSaveTimeout = setTimeout(() => {
        saveNotes(user);
      }, 1000);
    });
  }

  /**
   * Load notes from storage
   */
  async function loadNotes(user) {
    const textarea = document.getElementById("mym-notes-textarea");

    if (!textarea) return;

    try {
      const key = user.type === "username" ? user.username : `chat_${user.id}`;
      const data = await contentAPI.safeStorageGet("sync", ["notes_data"]);
      const notesData = data.notes_data || {};

      if (notesData[key]) {
        textarea.value = notesData[key];
      }
    } catch (error) {
      console.error("[MYM Notes] Error loading notes:", error);
    }
  }

  /**
   * Save notes to storage
   */
  async function saveNotes(user) {
    const textarea = document.getElementById("mym-notes-textarea");

    if (!textarea) return;

    try {
      const key = user.type === "username" ? user.username : `chat_${user.id}`;
      const data = await contentAPI.safeStorageGet("sync", ["notes_data"]);
      const notesData = data.notes_data || {};

      notesData[key] = textarea.value;
      await contentAPI.safeStorageSet("sync", { notes_data: notesData });
    } catch (error) {
      console.error("[MYM Notes] Error saving notes:", error);
    }
  }

  /**
   * Open template editor modal
   */
  function openTemplateEditor() {
    if (document.getElementById("mym-template-editor")) return;

    const modal = document.createElement("div");
    modal.id = "mym-template-editor";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
    `;

    const editor = document.createElement("div");
    editor.style.cssText = `
      background: ${getComputedStyle(document.documentElement).getPropertyValue('--mym-theme-gradient').trim() || `linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%)`};
      border-radius: 12px;
      padding: 20px;
      width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    `;

    const title = document.createElement("h3");
    title.textContent = "⚙️ Gérer les templates";
    title.style.cssText = `
      margin: 0;
      color: white;
      font-size: 18px;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      color: white;
      cursor: pointer;
      font-size: 18px;
    `;
    closeBtn.onclick = () => modal.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    const templatesList = document.createElement("div");
    templatesList.id = "mym-templates-list";
    templatesList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    `;

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Ajouter un template";
    addBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: none;
      padding: 10px;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    `;
    addBtn.onmouseenter = () =>
      (addBtn.style.background = "rgba(255, 255, 255, 0.3)");
    addBtn.onmouseleave = () =>
      (addBtn.style.background = "rgba(255, 255, 255, 0.2)");
    addBtn.onclick = () => addTemplateRow(templatesList);

    editor.appendChild(header);
    editor.appendChild(templatesList);
    editor.appendChild(addBtn);
    modal.appendChild(editor);
    document.body.appendChild(modal);

    loadTemplatesInEditor(templatesList);
  }

  /**
   * Load templates in editor
   */
  async function loadTemplatesInEditor(container) {
    const defaultTemplates = [
      "✅ Ok mon chou\nMerci pour ton message, je reviens vers toi rapidement !",
    ];

    try {
      const data = await contentAPI.safeStorageGet("sync", [
        "mym_note_templates",
      ]);
      const templates = data.mym_note_templates || defaultTemplates;

      container.innerHTML = "";
      templates.forEach((template, index) => {
        addTemplateRow(container, template, index);
      });
    } catch (error) {
      console.error("[MYM Notes] Error loading templates:", error);
    }
  }

  /**
   * Add template row to editor
   */
  function addTemplateRow(container, templateText = "", index = null) {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: flex-start;
    `;

    const textarea = document.createElement("textarea");
    textarea.value = templateText;
    textarea.placeholder = "Votre template...";
    textarea.style.cssText = `
      flex: 1;
      padding: 8px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      min-height: 60px;
      resize: vertical;
    `;
    textarea.oninput = () => saveTemplatesFromEditor();

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.style.cssText = `
      background: rgba(255, 0, 0, 0.3);
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
    `;
    deleteBtn.onmouseenter = () =>
      (deleteBtn.style.background = "rgba(255, 0, 0, 0.5)");
    deleteBtn.onmouseleave = () =>
      (deleteBtn.style.background = "rgba(255, 0, 0, 0.3)");
    deleteBtn.onclick = () => {
      row.remove();
      saveTemplatesFromEditor();
    };

    row.appendChild(textarea);
    row.appendChild(deleteBtn);
    container.appendChild(row);
  }

  /**
   * Save templates from editor
   */
  async function saveTemplatesFromEditor() {
    const container = document.getElementById("mym-templates-list");
    if (!container) return;

    const textareas = container.querySelectorAll("textarea");
    const templates = Array.from(textareas)
      .map((ta) => ta.value.trim())
      .filter((t) => t.length > 0);

    try {
      await contentAPI.safeStorageSet("sync", {
        mym_note_templates: templates,
      });
      // Reload templates in notes panel
      loadTemplates();
    } catch (error) {
      console.error("[MYM Notes] Error saving templates:", error);
    }
  }

  /**
   * Load templates from storage
   */
  async function loadTemplates() {
    const templatesGrid = document.getElementById("mym-templates-grid");
    if (!templatesGrid) return;

    const defaultTemplates = [
      "✅ Ok mon chou\nMerci pour ton message, je reviens vers toi rapidement !",
    ];

    try {
      const data = await contentAPI.safeStorageGet("sync", [
        "mym_note_templates",
      ]);
      const templates = data.mym_note_templates || defaultTemplates;

      templatesGrid.innerHTML = "";

      templates.forEach((template) => {
        const btn = document.createElement("button");
        const label =
          template.split("\n")[0].substring(0, 20) +
          (template.length > 20 ? "..." : "");
        btn.textContent = label;
        btn.title = template;
        btn.style.cssText = `
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `;
        btn.onmouseenter = () => {
          btn.style.background = "rgba(255, 255, 255, 0.25)";
          btn.style.transform = "translateY(-1px)";
        };
        btn.onmouseleave = () => {
          btn.style.background = "rgba(255, 255, 255, 0.15)";
          btn.style.transform = "translateY(0)";
        };
        btn.onclick = () => {
          const chatTextarea = document.querySelector(
            "textarea.input__input--textarea"
          );
          if (chatTextarea) {
            const currentText = chatTextarea.value;
            const newText = currentText
              ? currentText + "\n" + template
              : template;
            chatTextarea.value = newText;
            const event = new Event("input", { bubbles: true });
            chatTextarea.dispatchEvent(event);
            chatTextarea.focus();
          }
        };
        templatesGrid.appendChild(btn);
      });
    } catch (error) {
      console.error("[MYM Notes] Error loading templates:", error);
    }
  }

  /**
   * Sync notes to backend
   */
  async function syncNotesToBackend() {
    const textarea = document.getElementById("mym-notes-textarea");
    const status = document.getElementById("mym-notes-status");
    const syncBtn = document.getElementById("mym-notes-sync");

    if (!textarea || !contentAPI.api) return;

    const user = contentAPI.getUserIdentifier();
    if (user.type !== "username") {
      if (status) status.textContent = "⚠️ Sync uniquement pour usernames";
      return;
    }

    try {
      if (syncBtn) syncBtn.disabled = true;
      if (status) status.textContent = "☁️ Synchronisation...";

      await contentAPI.api.syncNotes(user.username, textarea.value);

      if (status) {
        status.textContent = "✅ Synchronisé";
        setTimeout(() => {
          if (status.textContent === "✅ Synchronisé") {
            status.textContent = "";
          }
        }, 2000);
      }
    } catch (error) {
      console.error("[MYM Notes] Sync error:", error);
      if (status) status.textContent = "❌ Erreur de sync";
    } finally {
      if (syncBtn) syncBtn.disabled = false;
    }
  }

  /**
   * Create notes button
   */
  function createNotesButton() {
    if (!contentAPI.notesEnabled) return;

    // Don't inject on /app/myms page (handled by injectNotesButtonsInList)
    if (window.location.pathname === "/app/myms") {
      // // // console.log("📝 [MYM Notes] On /app/myms page, skipping createNotesButton");
      return;
    }

    // Don't inject on followers page
    if (window.location.pathname.startsWith("/app/account/my-followers")) {
      // // // console.log("📝 [MYM Notes] On followers page, skipping createNotesButton");
      return;
    }

    if (document.getElementById("mym-notes-button")) return;

    // Priorité 1: Dans list__row__right (page de chat - à côté du dropdown)
    const listRowRight = document.querySelector(".list__row__right");

    // Priorité 2: Dans le menu dropdown (fallback)
    const dropdownMenu = document.querySelector(
      ".dropdown-menu.navigation__menu-list ul"
    );

    // Priorité 3: Dans le header du chat (fallback)
    const chatHeader = document.querySelector(
      ".chat__header, .content-search-bar"
    );

    if (listRowRight) {
      // Créer le bouton pour list__row__right
      const button = document.createElement("button");
      button.id = "mym-notes-button";
      button.type = "button";
      button.title = "Ouvrir les notes pour cet utilisateur";
      button.style.cssText = `
        background: ${getComputedStyle(document.documentElement).getPropertyValue('--mym-theme-gradient').trim() || `linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%)`};
        border: none;
        border-radius: 50%;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        font-size: 18px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        transition: all 0.2s;
        margin-right: 8px;
      `;
      button.textContent = "📝";

      button.addEventListener("mouseenter", () => {
        button.style.transform = "scale(1.1)";
        button.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.25)";
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "scale(1)";
        button.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.15)";
      });

      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const existingPanel = document.getElementById("mym-notes-panel");
        if (existingPanel) {
          existingPanel.remove();
        } else {
          createNotesPanel();
        }
      });

      // Insérer avant le menu-wrapper
      const menuWrapper = listRowRight.querySelector(
        ".list__row__right__menu-wrapper"
      );
      if (menuWrapper) {
        listRowRight.insertBefore(button, menuWrapper);
      } else {
        listRowRight.appendChild(button);
      }
      // // // console.log("📝 [MYM Notes] Button injected in list__row__right");
    } else if (dropdownMenu) {
      // Créer un élément <li> pour le menu dropdown
      const li = document.createElement("li");
      li.id = "mym-notes-menu-item";

      const link = document.createElement("a");
      link.href = "#";
      link.id = "mym-notes-button";
      link.title = "Ouvrir les notes pour cet utilisateur";

      const span = document.createElement("span");
      span.textContent = "Notes personnelles";

      const icon = document.createElement("i");
      icon.innerHTML = `<!-- notes --><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.83333 3.33333C4.91286 3.33333 4.16667 4.07953 4.16667 5V15C4.16667 15.9205 4.91286 16.6667 5.83333 16.6667H14.1667C15.0871 16.6667 15.8333 15.9205 15.8333 15V5C15.8333 4.07953 15.0871 3.33333 14.1667 3.33333H5.83333ZM2.5 5C2.5 3.15905 3.99238 1.66667 5.83333 1.66667H14.1667C16.0076 1.66667 17.5 3.15905 17.5 5V15C17.5 16.8409 16.0076 18.3333 14.1667 18.3333H5.83333C3.99238 18.3333 2.5 16.8409 2.5 15V5ZM6.66667 6.66667C6.66667 6.20643 7.03976 5.83333 7.5 5.83333H12.5C12.9602 5.83333 13.3333 6.20643 13.3333 6.66667C13.3333 7.1269 12.9602 7.5 12.5 7.5H7.5C7.03976 7.5 6.66667 7.1269 6.66667 6.66667ZM6.66667 10C6.66667 9.53976 7.03976 9.16667 7.5 9.16667H12.5C12.9602 9.16667 13.3333 9.53976 13.3333 10C13.3333 10.4602 12.9602 10.8333 12.5 10.8333H7.5C7.03976 10.8333 6.66667 10.4602 6.66667 10ZM6.66667 13.3333C6.66667 12.8731 7.03976 12.5 7.5 12.5H10C10.4602 12.5 10.8333 12.8731 10.8333 13.3333C10.8333 13.7936 10.4602 14.1667 10 14.1667H7.5C7.03976 14.1667 6.66667 13.7936 6.66667 13.3333Z" fill="#EDEEF0"/></svg>`;

      link.appendChild(span);
      link.appendChild(icon);
      li.appendChild(link);

      link.addEventListener("click", (e) => {
        e.preventDefault();
        const existingPanel = document.getElementById("mym-notes-panel");
        if (existingPanel) {
          existingPanel.remove();
        } else {
          createNotesPanel();
        }

        // Fermer le dropdown
        const dropdown = document.querySelector(
          ".dropdown-menu.navigation__menu-list"
        );
        if (dropdown) {
          dropdown.classList.remove("show");
        }
      });

      // Insérer en première position dans le menu
      dropdownMenu.insertBefore(li, dropdownMenu.firstChild);
      // // // console.log("📝 [MYM Notes] Button injected in dropdown menu");
    } else if (chatHeader) {
      // Style pour le header du chat (fallback)
      const button = document.createElement("button");
      button.id = "mym-notes-button";
      button.textContent = "📝 Notes";
      button.title = "Ouvrir les notes pour cet utilisateur";
      button.style.cssText = `
        background: ${getComputedStyle(document.documentElement).getPropertyValue('--mym-theme-gradient').trim() || `linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%)`};
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        color: white;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        margin-left: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: all 0.2s;
      `;

      button.addEventListener("mouseenter", () => {
        button.style.transform = "translateY(-2px)";
        button.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "translateY(0)";
        button.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
      });

      button.addEventListener("click", () => {
        const existingPanel = document.getElementById("mym-notes-panel");
        if (existingPanel) {
          existingPanel.remove();
        } else {
          createNotesPanel();
        }
      });

      chatHeader.appendChild(button);
      // // // console.log("📝 [MYM Notes] Button injected in chat header");
    }
  }

  /**
   * Remove notes UI elements
   */
  function removeNotesUI() {
    const btn = document.getElementById("mym-notes-button");
    const menuItem = document.getElementById("mym-notes-menu-item");
    const panel = document.getElementById("mym-notes-panel");
    if (btn) btn.remove();
    if (menuItem) menuItem.remove();
    if (panel) panel.remove();
  }

  /**
   * Initialize notes system (called by main content script)
   */
  function initNotesSystem() {
    // // // console.log("📝 [MYM Notes] Initializing notes system...");

    if (!contentAPI.notesEnabled) {
      // // // console.log("⏸️ [MYM Notes] Notes disabled");
      return;
    }

    // Observer to add notes button to chat header with debounce
    const checkNotesButton = debounce(() => {
      // Don't observe on /app/myms (handled separately)
      if (window.location.pathname === "/app/myms") {
        injectNotesButtonsInList();
        return;
      }

      const chatHeader = document.querySelector(SELECTORS.CHAT_HEADER);
      if (chatHeader && !chatHeader.querySelector("#mym-notes-button")) {
        createNotesButton();
      }
    }, 200);

    const observer = new MutationObserver(checkNotesButton);

    observer.observe(document.body, {
      childList: true,
      subtree: false, // Limit to direct children for performance
    });

    // Initial check
    const chatHeader = document.querySelector(SELECTORS.CHAT_HEADER);
    if (chatHeader) {
      createNotesButton();
    }

    // Initial check for /app/myms page
    if (window.location.pathname === "/app/myms") {
      setTimeout(() => {
        injectNotesButtonsInList();
      }, 500);
    }
  }

  // Export public API
  contentAPI.notes = {
    createNotesPanel,
    createNotesButton,
    removeNotesUI,
    loadNotes,
    saveNotes,
    loadTemplates,
    syncNotesToBackend,
    initNotesSystem,
    injectNotesButtonsInList,
    openNotesForUser,
  };

  // // // console.log("✅ [MYM Notes] Module loaded");
})(window.MYM_CONTENT_API);
