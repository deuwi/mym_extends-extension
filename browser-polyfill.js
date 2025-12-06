// browser-polyfill.js - Polyfill pour compatibilité Chrome/Firefox
// Firefox utilise browser.* tandis que Chrome utilise chrome.*
// Ce polyfill permet d'utiliser chrome.* partout

if (typeof browser !== "undefined" && typeof chrome === "undefined") {
  // Firefox detected - create chrome alias
  globalThis.chrome = browser;
}
