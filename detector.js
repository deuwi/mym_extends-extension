(() => {
  try {
    const orig = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, async) {
      try {
        if (async === false) {
          console.warn("MYM Detector: synchronous XHR detected", {
            method,
            url,
          });
          try {
            throw new Error("sync-xhr-stack");
          } catch (e) {
            console.warn(e.stack);
          }
        }
      } catch (e) {
        /* ignore detection errors */
      }
      return orig.apply(this, arguments);
    };
  } catch (e) {
    console.warn("MYM Detector: could not patch XHR", e);
  }
})();
