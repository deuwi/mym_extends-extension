// stats.js - Module pour la box d'informations utilisateur
(function (contentAPI) {
  "use strict";

  let isUpdatingUserInfoBox = false;
  let currentUserInfoBoxUsername = null;
  let userInfoBoxFetchController = null;

  /**
   * Inject user info box in sidebar
   */
  async function injectUserInfoBox(username) {
    console.log(`📊 [MYM Stats] injectUserInfoBox called for: ${username}`);

    if (!username || !contentAPI.statsEnabled) {
      // // // console.log("⏸️ [MYM Stats] No username or stats disabled");
      const existingBox = document.getElementById("mym-user-info-box");
      if (existingBox) existingBox.remove();
      currentUserInfoBoxUsername = null;
      return;
    }

    if (isUpdatingUserInfoBox && currentUserInfoBoxUsername === username) {
      // // // console.log("⏭️ [MYM Stats] Already updating for this user");
      return;
    }

    isUpdatingUserInfoBox = true;
    currentUserInfoBoxUsername = username;

    try {
      let userInfoBox = document.getElementById("mym-user-info-box");

      if (!userInfoBox) {
        // // // console.log("🎨 [MYM Stats] Creating new stats box");
        userInfoBox = document.createElement("div");
        userInfoBox.id = "mym-user-info-box";
        userInfoBox.style.cssText = `
          background: linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%);
          border-radius: 12px;
          padding: 8px;
          margin-bottom: 8px;
          color: white;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;

        const sidebarSection = document.querySelector(".sidebar__section");
        if (sidebarSection) {
          // // // console.log("✅ [MYM Stats] Inserting box into sidebar");
          sidebarSection.insertBefore(userInfoBox, sidebarSection.firstChild);
        } else {
          console.error("❌ [MYM Stats] Sidebar section not found!");
          isUpdatingUserInfoBox = false;
          currentUserInfoBoxUsername = null;
          return;
        }
      } else {
        // // // console.log("♻️ [MYM Stats] Reusing existing box");
      }

      userInfoBox.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 14px; opacity: 0.9;">⏳ Chargement des informations...</div>
        </div>
      `;

      // Utiliser le module badges pour récupérer les infos
      const info = await (contentAPI.badges
        ? contentAPI.badges.fetchUserDetailedInfo(
            username,
            false,
            "userInfoBox"
          )
        : null);

      if (currentUserInfoBoxUsername !== username) {
        isUpdatingUserInfoBox = false;
        return;
      }

      if (!info) {
        isUpdatingUserInfoBox = false;
        currentUserInfoBoxUsername = null;
        return;
      }

      const userCategory = await contentAPI.getUserCategory(username);

      let subscriptionBadge = "";
      if (info.subscriptionRenewal > 0) {
        subscriptionBadge =
          '<span style="background: rgba(34, 197, 94, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">🔄 RENOUVELÉ</span>';
      } else if (info.subscription > 0) {
        subscriptionBadge =
          '<span style="background: rgba(59, 130, 246, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">💰 PAYANT</span>';
      } else if (info.isSubscribed) {
        subscriptionBadge =
          '<span style="background: rgba(251, 191, 36, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">🎁 GRATUIT</span>';
      } else {
        subscriptionBadge =
          '<span style="background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">○ NON ABONNÉ</span>';
      }

      userInfoBox.innerHTML = `
        <div style="margin-bottom: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
            <div style="font-size: 14px; font-weight: 700;">👤 ${
              info.username
            }</div>
            <button class="mym-refresh-info" title="Rafraîchir" style="
              background: rgba(255, 255, 255, 0.1);
              border: none;
              border-radius: 4px;
              padding: 4px 8px;
              color: white;
              cursor: pointer;
              font-size: 12px;
              transition: all 0.2s;
            ">🔄</button>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${subscriptionBadge}
            <div style="display: flex; gap: 2px; flex: 1;">
              <button class="mym-category-btn" data-category="TW" style="
                flex: 1; padding: 2px; border: none;
                background: ${
                  userCategory === "TW" ? "#ef4444" : "rgba(239, 68, 68, 0.3)"
                };
                color: white; border-radius: 3px; font-size: 16px; cursor: pointer;
                box-shadow: ${
                  userCategory === "TW" ? "0 1px 3px rgba(0,0,0,0.2)" : "none"
                };
              ">⏱️</button>
              <button class="mym-category-btn" data-category="SP" style="
                flex: 1; padding: 2px; border: none;
                background: ${
                  userCategory === "SP" ? "#10b981" : "rgba(16, 185, 129, 0.3)"
                };
                color: white; border-radius: 3px; font-size: 16px; cursor: pointer;
                box-shadow: ${
                  userCategory === "SP" ? "0 1px 3px rgba(0,0,0,0.2)" : "none"
                };
              ">💰</button>
              <button class="mym-category-btn" data-category="Whale" style="
                flex: 1; padding: 2px; border: none;
                background: ${
                  userCategory === "Whale"
                    ? "#3b82f6"
                    : "rgba(59, 130, 246, 0.3)"
                };
                color: white; border-radius: 3px; font-size: 16px; cursor: pointer;
                box-shadow: ${
                  userCategory === "Whale"
                    ? "0 1px 3px rgba(0,0,0,0.2)"
                    : "none"
                };
              ">🐋</button>
            </div>
          </div>
          ${
            info.firstSubscriptionDate
              ? `<div style="font-size: 11px; opacity: 0.85; margin-top: 4px;">📅 Premier abo: ${info.firstSubscriptionDate}</div>`
              : ""
          }
        </div>
        
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
          <div style="background: rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 8px; flex: 1;">
            <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; opacity: 0.9;">💰 Total dépensé</div>
            <div style="font-size: 18px; font-weight: 700;">${contentAPI.formatCurrency(
              info.totalSpent
            )}</div>
          </div>
          <button id="mym-toggle-details" style="
            background: rgba(255, 255, 255, 0.1);
            border: none; border-radius: 6px;
            padding: 8px 12px; color: white;
            cursor: pointer; font-size: 14px;
          ">▼</button>
        </div>

        <div id="mym-details-container" style="display: none;">
          <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px;">
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px);">
              <div style="opacity: 0.75; margin-bottom: 2px;">📬 Médias push</div>
              <div style="font-weight: 600;">${contentAPI.formatCurrency(
                info.mediaPush
              )}</div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px);">
              <div style="opacity: 0.75; margin-bottom: 2px;">⭐ Abonnements</div>
              <div style="font-weight: 600;">${contentAPI.formatCurrency(
                info.subscription
              )}</div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px);">
              <div style="opacity: 0.75; margin-bottom: 2px;">🔄 Renouvellements</div>
              <div style="font-weight: 600;">${contentAPI.formatCurrency(
                info.subscriptionRenewal
              )}</div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px);">
              <div style="opacity: 0.75; margin-bottom: 2px;">🎬 À la demande</div>
              <div style="font-weight: 600;">${contentAPI.formatCurrency(
                info.mediaOnDemand
              )}</div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px);">
              <div style="opacity: 0.75; margin-bottom: 2px;">🔒 Médias privés</div>
              <div style="font-weight: 600;">${contentAPI.formatCurrency(
                info.mediaPrivate
              )}</div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px);">
              <div style="opacity: 0.75; margin-bottom: 2px;">💝 Pourboires</div>
              <div style="font-weight: 600;">${contentAPI.formatCurrency(
                info.tips
              )}</div>
            </div>
            ${
              info.consultation > 0
                ? `
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 6px; width: calc(50% - 3px);">
              <div style="opacity: 0.75; margin-bottom: 2px;">📞 Consultation</div>
              <div style="font-weight: 600;">${contentAPI.formatCurrency(
                info.consultation
              )}</div>
            </div>`
                : ""
            }
          </div>
        </div>
      `;

      // Event listeners
      const refreshBtn = userInfoBox.querySelector(".mym-refresh-info");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
          refreshBtn.textContent = "⏳";
          refreshBtn.disabled = true;
          await injectUserInfoBox(username);
          setTimeout(() => {
            refreshBtn.textContent = "🔄";
            refreshBtn.disabled = false;
          }, 500);
        });
      }

      const categoryButtons = userInfoBox.querySelectorAll(".mym-category-btn");
      categoryButtons.forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const clickedCategory = e.target.getAttribute("data-category");
          const newCategory =
            clickedCategory === userCategory ? "" : clickedCategory;
          await contentAPI.setUserCategory(username, newCategory);
          const existingBox = document.getElementById("mym-user-info-box");
          if (existingBox) existingBox.remove();
          await injectUserInfoBox(username);
        });
      });

      const toggleBtn = userInfoBox.querySelector("#mym-toggle-details");
      const detailsContainer = userInfoBox.querySelector(
        "#mym-details-container"
      );
      if (toggleBtn && detailsContainer) {
        toggleBtn.addEventListener("click", () => {
          const isVisible = detailsContainer.style.display !== "none";
          detailsContainer.style.display = isVisible ? "none" : "block";
          toggleBtn.textContent = isVisible ? "▼" : "▲";
        });
      }

      isUpdatingUserInfoBox = false;
    } catch (error) {
      console.error("[MYM Stats] Error:", error);
      isUpdatingUserInfoBox = false;
    }
  }

  /**
   * Remove stats box
   */
  function removeStatsBox() {
    const box = document.getElementById("mym-user-info-box");
    if (box) box.remove();
    currentUserInfoBoxUsername = null;
  }

  // Export public API
  contentAPI.stats = {
    injectUserInfoBox,
    removeStatsBox,
  };

  // // // console.log("✅ [MYM Stats] Module loaded");
})(window.MYM_CONTENT_API);
