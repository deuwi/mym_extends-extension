// api.js - Module centralisé pour les appels API
(function (contentAPI) {
  "use strict";

  const API_BASE = contentAPI.API_BASE || "https://chat4creators.fr/api";

  /**
   * Retry logic with exponential backoff
   */
  async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);

        if (!response.ok && response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response;
      } catch (error) {
        lastError = error;

        if (i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get access token from storage
   */
  async function getAccessToken() {
    const items = await contentAPI.safeStorageGet("local", [
      "firebaseToken",
      "access_token",
    ]);
    return items.firebaseToken || items.access_token;
  }

  /**
   * Check subscription status
   */
  async function checkSubscription(token) {
    try {
      const response = await fetchWithRetry(API_BASE + "/check-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        return { subscription_active: false, trial_days_remaining: 0 };
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return { subscription_active: false, trial_days_remaining: 0 };
      }

      return await response.json();
    } catch (error) {
      console.error("[MYM API] Subscription check error:", error);
      return { subscription_active: false, trial_days_remaining: 0 };
    }
  }

  /**
   * Sync notes to backend
   */
  async function syncNotes(username, notes) {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("No access token available");
    }

    try {
      const response = await fetchWithRetry(API_BASE + "/notes/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, notes }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("[MYM API] Notes sync error:", error);
      throw error;
    }
  }

  /**
   * Fetch notes from backend
   */
  async function fetchNotes(username) {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetchWithRetry(
        API_BASE + `/notes/${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.notes || null;
    } catch (error) {
      console.error("[MYM API] Notes fetch error:", error);
      return null;
    }
  }

  /**
   * Fetch user detailed info from MYM platform
   */
  async function fetchUserIncomeDetails(username, signal = null) {
    try {
      const url = `${
        location.origin
      }/app/income-details?search=${encodeURIComponent(username)}`;
      const options = { credentials: "include" };

      if (signal) {
        options.signal = signal;
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        return null;
      }

      return await response.text();
    } catch (error) {
      if (error.name === "AbortError") {
        return null;
      }
      console.error("[MYM API] Income details fetch error:", error);
      return null;
    }
  }

  // Export public API
  contentAPI.api = {
    fetchWithRetry,
    getAccessToken,
    checkSubscription,
    syncNotes,
    fetchNotes,
    fetchUserIncomeDetails,
  };

  // console.log("✅ [MYM API] Module loaded");
})(window.MYM_CONTENT_API);
