// badges.js - Module pour la gestion des badges de revenus
(function (contentAPI) {
  "use strict";

  // Cache LRU pour les informations utilisateurs
  const totalSpentFetched = new contentAPI.LRUCache(
    contentAPI.LRU_CACHE_MAX_SIZE
  );
  const userInfoCache = new contentAPI.LRUCache(contentAPI.LRU_CACHE_MAX_SIZE);
  let badgeFetchController = null;

  // Configuration des catégories
  const categoryConfig = {
    TW: { emoji: "⏱️", label: "Time Waster", color: "#ef4444" },
    SP: { emoji: "💰", label: "Sérieux Payeur", color: "#10b981" },
    Whale: { emoji: "🐋", label: "Whale", color: "#8b5cf6" },
  };

  /**
   * Récupère les informations détaillées d'un utilisateur
   */
  async function fetchUserDetailedInfo(
    username,
    forceRefresh = false,
    source = "badge"
  ) {
    let controller = badgeFetchController;

    // Pour userInfoBox, utiliser un controller séparé si nécessaire
    if (source === "userInfoBox") {
      // // // // console.log("📊 [MYM Badges] UserInfoBox request, proceeding...");
    }

    badgeFetchController = new AbortController();
    controller = badgeFetchController;
    const signal = controller.signal;

    // Vérifier le cache
    if (!forceRefresh) {
      const cached = userInfoCache.get(username);
      if (
        cached &&
        Date.now() - cached.timestamp < contentAPI.USER_INFO_CACHE_DURATION
      ) {
        // console.log(`✅ [MYM Badges] Using cached data for ${username}`);
        badgeFetchController = null;
        return cached.data;
      }
    }

    // console.log(`🌐 [MYM Badges] Fetching fresh data for ${username}...`);

    const info = {
      username: username,
      isSubscribed: false,
      totalSpent: 0,
      mediaPrivate: 0,
      mediaPush: 0,
      mediaOnDemand: 0,
      subscription: 0,
      subscriptionRenewal: 0,
      tips: 0,
      consultation: 0,
      firstSubscriptionDate: null,
    };

    try {
      const url = `${
        location.origin
      }/app/income-details?search=${encodeURIComponent(username)}`;
      const response = await fetch(url, { credentials: "include", signal });

      if (!response.ok) {
        badgeFetchController = null;
        return info;
      }

      const html = await response.text();
      const parser = new DOMParser();

      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages && currentPage <= contentAPI.MAX_PAGES_FETCH) {
        const pageUrl = currentPage === 1 ? url : `${url}&page=${currentPage}`;
        const pageResponse = await fetch(pageUrl, {
          credentials: "include",
          signal,
        });

        if (!pageResponse.ok) break;

        const pageHtml = await pageResponse.text();
        const pageDoc = parser.parseFromString(pageHtml, "text/html");
        const incomeCards = pageDoc.querySelectorAll(".card-income");

        if (incomeCards.length === 0) {
          hasMorePages = false;
          break;
        }

        incomeCards.forEach((card) => {
          const typeElement =
            card.querySelector(".card-income__info--title") ||
            card.querySelector(".card-income__info--type");
          const amountElement = card.querySelector(
            ".card-income__info--amount"
          );
          const dateElement = card.querySelector(".card-income__info--date");

          if (!typeElement || !amountElement) return;

          const type = typeElement.textContent.trim().toLowerCase();
          const amountText = amountElement.textContent.trim();
          const match = amountText.match(/([+-]?\d+[\s,\.]*\d*)\s*€/);

          if (!match) return;

          const amount = parseFloat(
            match[1].replace(/\s/g, "").replace(",", ".")
          );
          const isSubscriptionType =
            type.includes("abonnement") ||
            type.includes("subscription") ||
            type.includes("renouvellement");

          if (isNaN(amount) || amount < 0) return;
          if (amount === 0 && !isSubscriptionType) return;

          const isDone =
            card.querySelector(".card-income__info--status-done") !== null;
          const isPending =
            card.querySelector(".card-income__info--status-pending") !== null;

          if ((isDone || isPending) && amount > 0) {
            info.totalSpent += amount;
          }

          // Catégorisation
          if (type.includes("privé") || type.includes("private")) {
            info.mediaPrivate += amount;
          } else if (type.includes("push")) {
            info.mediaPush += amount;
          } else if (
            type.includes("on demand") ||
            type.includes("à la demande")
          ) {
            info.mediaOnDemand += amount;
          } else if (type.includes("pourboire") || type.includes("tip")) {
            info.tips += amount;
          } else if (type.includes("consultation")) {
            info.consultation += amount;
          } else if (type.includes("renouvellement")) {
            if (amount > 0) info.subscriptionRenewal += amount;
            info.isSubscribed = true;
          } else if (
            type.includes("abonnement") ||
            type.includes("subscription")
          ) {
            if (amount > 0) info.subscription += amount;
            info.isSubscribed = true;

            if (dateElement && !info.firstSubscriptionDate) {
              const desktopDate = dateElement.querySelector(
                ".date-responive-desktop"
              );
              if (desktopDate) {
                info.firstSubscriptionDate = desktopDate.textContent.trim();
              } else {
                const mobileDate = dateElement.querySelector(
                  "time.date-responive-mobile"
                );
                if (mobileDate) {
                  info.firstSubscriptionDate = mobileDate.textContent.trim();
                }
              }
            }
          }
        });

        currentPage++;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      userInfoCache.set(username, { data: info, timestamp: Date.now() });
      badgeFetchController = null;
      return info;
    } catch (err) {
      badgeFetchController = null;
      if (err.name === "AbortError") return null;
      return info;
    }
  }

  /**
   * Ajoute un badge de revenu à une carte utilisateur
   */
  async function addTotalSpentBadgeToCard(card, totalSpent, username) {
    const existingBadge = card.querySelector(".mym-total-spent-badge");

    if (existingBadge) {
      const existingCategoryBadge = card.querySelector(".mym-category-badge");
      if (existingCategoryBadge) return;

      const category = await contentAPI.getUserCategory(username);
      if (category && categoryConfig[category]) {
        const config = categoryConfig[category];
        const categoryBadge = createCategoryBadge(config, category);
        existingBadge.parentElement.insertBefore(
          categoryBadge,
          existingBadge.nextSibling
        );
      }
      return;
    }

    const category = await contentAPI.getUserCategory(username);
    let badge = null;

    if (totalSpent > 0) {
      badge = document.createElement("div");
      badge.className = "mym-total-spent-badge";
      badge.style.cssText = `
        display: inline-block;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        margin-left: 8px;
        vertical-align: middle;
      `;
      badge.textContent = `${totalSpent.toFixed(2)}€`;
      badge.title = `Revenu total de ${username}: ${totalSpent.toFixed(2)}€`;
    }

    let categoryBadge = null;
    if (category && categoryConfig[category]) {
      const config = categoryConfig[category];
      categoryBadge = createCategoryBadge(config, category);
    }

    // Chercher le conteneur pour le badge - plusieurs possibilités
    let targetContainer =
      card.querySelector(".user-card__nickname-container") || // Pour les user-card
      card.querySelector(".nickname_profile") || // Pour les list__row
      card.querySelector(".list__row__label") || // Fallback pour list__row
      card.querySelector(".list__row__right"); // Dernière option

    // Debug: afficher tous les conteneurs possibles
    // console.log(
    //   `🔍 [MYM Badges] Looking for badge container in card.${card.className}`
    // );
    // console.log(
    //   `  - .user-card__nickname-container: ${!!card.querySelector(
    //     ".user-card__nickname-container"
    //   )}`
    // );
    // console.log(
    //   `  - .nickname_profile: ${!!card.querySelector(".nickname_profile")}`
    // );
    // console.log(
    //   `  - .list__row__label: ${!!card.querySelector(".list__row__label")}`
    // );
    // console.log(
    //   `  - .list__row__right: ${!!card.querySelector(".list__row__right")}`
    // );

    if (targetContainer) {
      if (badge) targetContainer.appendChild(badge);
      if (categoryBadge) targetContainer.appendChild(categoryBadge);
      // console.log(
      //   `✅ [MYM Badges] Badge inserted in ${targetContainer.className}`
      // );
    } else {
      console.warn(
        `⚠️ [MYM Badges] No target container found in card`,
        card.className
      );
      console.warn(`  Card HTML structure:`, card.innerHTML.substring(0, 300));
    }
  }

  /**
   * Crée un badge de catégorie
   */
  function createCategoryBadge(config, category) {
    const badge = document.createElement("div");
    badge.className = "mym-category-badge";
    badge.style.cssText = `
      display: inline-block;
      background: ${config.color};
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 4px;
      vertical-align: middle;
    `;
    badge.textContent = `${config.emoji} ${category}`;
    badge.title = config.label;
    return badge;
  }

  /**
   * Scanner les listes existantes et ajouter les badges
   */
  async function scanExistingListsForBadges() {
    if (!contentAPI.badgesEnabled) {
      // // // // console.log("⏸️ [MYM Badges] Badges disabled, skipping scan");
      return;
    }

    // // // // console.log("🔍 [MYM Badges] Starting scan...");

    // Debug: afficher toute la structure de la page
    // // // // console.log("🔍 [MYM Badges] Full page structure:");
    // // // // console.log("  body children:", document.body.children.length);

    const mainContainers = document.querySelectorAll(
      'main, [role="main"], .main, .page, .app, .container'
    );
    // console.log(`  Found ${mainContainers.length} main containers`);

    mainContainers.forEach((container, idx) => {
      // console.log(`    [${idx}] ${container.tagName}.${container.className}`);
      // console.log(
      //   `        Children (${container.children.length}):`,
      //   Array.from(container.children)
      //     .slice(0, 5)
      //     .map((c) => `${c.tagName}.${c.className}`)
      //     .join(", ")
      // );
    });

    // Chercher spécifiquement des liens vers /app/chat/
    const allChatLinks = document.querySelectorAll('a[href*="/app/chat/"]');
    // console.log(
    //   `🔍 [MYM Badges] Found ${allChatLinks.length} links to /app/chat/`
    // );

    if (allChatLinks.length > 0) {
      allChatLinks.forEach((link, idx) => {
        if (idx < 5) {
          // Afficher les 5 premiers
          const parent = link.closest(
            '[class*="row"], [class*="card"], [class*="item"], [class*="chat"], [class*="conversation"]'
          );
          // console.log(`    [${idx}] ${link.href}`);
          // console.log(
          //   `        Parent: ${
          //     parent ? parent.tagName + "." + parent.className : "none"
          //   }`
          // );
        }
      });
    }

    // Chercher tous les conteneurs possibles de listes de conversations
    const possibleSelectors = [
      ".discussions__chats",
      ".page.my-myms",
      ".discussions",
      ".sidebar__conversations",
      "[class*='conversation']",
      "[class*='discussion']",
    ];

    // // // // console.log("🔍 [MYM Badges] Searching for conversation containers...");

    for (const selector of possibleSelectors) {
      const containers = document.querySelectorAll(selector);
      if (containers.length > 0) {
        // console.log(
        //   `  ✅ Found ${containers.length} containers with selector: ${selector}`
        // );

        containers.forEach((container, idx) => {
          // console.log(
          //   `    [${idx}] ${container.tagName}.${container.className} - ${container.children.length} children`
          // );

          // Afficher les 3 premiers enfants
          const firstChildren = Array.from(container.children)
            .slice(0, 3)
            .map((c) => ({
              tag: c.tagName,
              classes: c.className,
              hasLink: !!c.querySelector('a[href*="/app/chat/"]'),
            }));
          // console.log(`    First 3 children:`, firstChildren);
        });
      }
    }

    // Chercher les vrais conteneurs de conversations (exclure le footer)
    const allContainers = document.querySelectorAll(
      ".mym-conversations-list, .discussions__chats, .list, .page.my-myms"
    );

    // Filtrer pour exclure .sidebar__footer__list
    const listContainers = Array.from(allContainers).filter((container) => {
      const isFooter =
        container.classList.contains("sidebar__footer__list") ||
        container.querySelector(".sidebar__footer__list") === container;
      if (isFooter) {
        // console.log(
        //   `⏭️ [MYM Badges] Skipping footer container: ${container.className}`
        // );
      }
      return !isFooter;
    });

    // console.log(
    //   `🔍 [MYM Badges] Processing ${listContainers.length} containers (footer excluded)`
    // );

    for (const container of listContainers) {
      // Debug: afficher la structure HTML du conteneur
      // console.log(`🔍 [MYM Badges] Container classes:`, container.className);
      // console.log(
      //   `🔍 [MYM Badges] Container children count:`,
      //   container.children.length
      // );

      const firstChildren = Array.from(container.children)
        .slice(0, 5)
        .map((c) => ({
          tag: c.tagName,
          classes: c.className,
          id: c.id,
          hasLink: !!c.querySelector('a[href*="/app/chat/"]'),
          linkHref: c.querySelector('a[href*="/app/chat/"]')?.href || "none",
        }));

      // console.log(`🔍 [MYM Badges] First 5 children:`, firstChildren);
      firstChildren.forEach((child, i) => {
        // console.log(
        //   `  [${i}] ${child.tag}.${child.classes || "(no class)"} - Link: ${
        //     child.hasLink ? "✅" : "❌"
        //   } (${child.linkHref})`
        // );
      });

      // Chercher les rows de conversations - le parent du lien trouvé était .list__row__label-container
      let rows = container.querySelectorAll(
        ".list__row, .card-fan, .discussion-item, [class*='conversation']"
      );
      // console.log(
      //   `🔍 [MYM Badges] Looking for conversation rows, found ${rows.length} items`
      // );

      // Si pas de résultats, chercher directement les conteneurs avec des liens chat
      if (rows.length === 0) {
        const chatLinks = container.querySelectorAll(
          'a[href*="/app/chat/fan/"]'
        );
        // console.log(
        //   `🔍 [MYM Badges] Found ${chatLinks.length} chat links directly`
        // );

        // Remonter au parent row pour chaque lien
        rows = Array.from(chatLinks)
          .map((link) => {
            const row = link.closest(
              '.list__row, [class*="row"], [class*="card"], [class*="item"]'
            );
            // console.log(
            //   `    Link ${link.href} → Row: ${row?.className || "not found"}`
            // );
            return row;
          })
          .filter(Boolean);

        // console.log(
        //   `🔍 [MYM Badges] Extracted ${rows.length} rows from chat links`
        // );
      }

      // console.log(`🔍 [MYM Badges] Found ${rows.length} rows in container`);

      for (const row of rows) {
        try {
          // Chercher le lien /app/chat/fan/ dans le row
          let link =
            row.querySelector('a[href*="/app/chat/fan/"]') ||
            row.querySelector('a[href*="/app/chat/"]');

          // Debug: afficher ce qu'on a trouvé
          if (row.tagName === "A" && !link) {
            console.log(
              `🔍 [MYM Badges] Found <A> but href doesn't match. href="${row.href}", className="${row.className}"`
            );
          }

          // Sinon chercher un lien enfant
          if (!link) {
            link = row.querySelector('a[href*="/app/chat/"]');
          }

          if (!link) {
            // Silently skip rows without chat links (e.g., action buttons)
            continue;
          }

          const username = contentAPI.extractUsername(link);
          if (!username) {
            // // // // console.log("⚠️ [MYM Badges] No username extracted from", link.href);
            continue;
          }

          if (totalSpentFetched.get(username)) {
            // console.log(`⏭️ [MYM Badges] Already fetched ${username}`);
            continue;
          }

          // console.log(`💰 [MYM Badges] Fetching info for ${username}`);
          totalSpentFetched.set(username, true);

          const info = await fetchUserDetailedInfo(username);
          if (info) {
            if (info.totalSpent > 0) {
              // console.log(
              //   `✅ [MYM Badges] Adding badge for ${username}: ${info.totalSpent}€`
              // );
            } else {
              // console.log(
              //   `✅ [MYM Badges] Adding category badge for ${username} (no spending)`
              // );
            }
            await addTotalSpentBadgeToCard(row, info.totalSpent, username);
          } else {
            console.log(`⚠️ [MYM Badges] No info available for ${username}`);
          }
        } catch (e) {
          // Ignore "Extension context invalidated" errors (extension reload/update)
          if (e.message && e.message.includes("Extension context invalidated")) {
            // Silently skip - extension is being reloaded
            return;
          }
          console.error("[MYM Badges] Error processing row:", e);
        }
      }

      const userCards = container.querySelectorAll(".user-card");
      for (const card of userCards) {
        try {
          const link = card.querySelector('a[href*="/app/chat/"]');
          if (!link) continue;

          const username = contentAPI.extractUsernameFromCard(card);
          if (!username) continue;

          if (totalSpentFetched.get(username)) continue;
          totalSpentFetched.set(username, true);

          const info = await fetchUserDetailedInfo(username);
          if (info && info.totalSpent > 0) {
            await addTotalSpentBadgeToCard(card, info.totalSpent, username);
          }
        } catch (e) {
          // Ignore "Extension context invalidated" errors (extension reload/update)
          if (e.message && e.message.includes("Extension context invalidated")) {
            return;
          }
          console.error("[MYM Badges] Error processing card:", e);
        }
      }
    }
  }

  /**
   * Scan a single card for badges
   */
  function scanSingleCard(card) {
    const username = contentAPI.extractUsernameFromCard(card);
    if (!username) return;

    // Check if badge already exists
    if (card.querySelector(".mym-total-spent-badge")) return;

    // Fetch and add badge
    fetchUserDetailedInfo(username, false, "single-card").then((userInfo) => {
      if (userInfo && userInfo.totalSpent !== undefined) {
        addTotalSpentBadgeToCard(card, userInfo.totalSpent, username);
      }
    });
  }

  // Export des fonctions publiques
  contentAPI.badges = {
    fetchUserDetailedInfo,
    addTotalSpentBadgeToCard,
    scanExistingListsForBadges,
    scanSingleCard,
  };

  // // // // console.log("✅ [MYM Badges] Module loaded");
})(window.MYM_CONTENT_API);
