// api-config.js — Auto-detects whether the app is opened as a file:// or via http server
// Patches window.fetch so all relative /api/ calls always go to the correct backend URL.
(function() {
  const API_BASE = window.location.protocol === 'file:'
    ? 'http://localhost:4000'
    : '';

  if (!API_BASE) return; // Already on server, no patching needed

  const _originalFetch = window.fetch.bind(window);
  window.fetch = function(url, options) {
    if (typeof url === 'string' && url.startsWith('/api')) {
      url = API_BASE + url;
    }
    return _originalFetch(url, options);
  };

  // Also fix any window.location.href navigations that go to relative paths
  // (these work fine since they stay within file://, navigation is ok)
})();
