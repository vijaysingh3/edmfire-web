// ============================================
// EDMFire Support - Security Layer (Loaded FIRST)
// Blocks casual inspection: devtools shortcuts, right-click,
// view-source, console logging. Detects devtools opening
// and blanks the screen. NOTE: Browser security model
// means no client-side protection is 100% — this raises
// the bar against casual inspection, not against a
// determined reverse-engineer. True protection comes
// from server-side validation (which is already in place
// via Firestore + RTDB security rules + ID token checks).
// ============================================
(function () {
  'use strict';

  // ---------- 1. CONSOLE OVERRIDE ----------
  // Replace all console methods with no-ops so nothing leaks
  // to devtools console. Keep a private reference for our
  // own critical errors (sent to server, not console).
  try {
    var noop = function () {};
    window.console.log = noop;
    window.console.info = noop;
    window.console.debug = noop;
    window.console.warn = noop;
    // Keep error for genuine crashes — but it's still muted in production
    window.console.error = noop;
    window.console.trace = noop;
    window.console.dir = noop;
    window.console.table = noop;
    window.console.group = noop;
    window.console.groupEnd = noop;
    window.console.groupCollapsed = noop;
  } catch (e) {}

  // ---------- 2. DISABLE RIGHT-CLICK ----------
  // Blocks casual "Inspect Element" via right-click.
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  }, true);

  // ---------- 3. BLOCK KEYBOARD SHORTCUTS ----------
  // F12, Ctrl+Shift+I/J/C, Ctrl+U (view source), Cmd+Opt+I/J (Mac)
  document.addEventListener('keydown', function (e) {
    try {
      var key = e.key ? e.key.toLowerCase() : '';
      var code = e.keyCode || e.which || 0;

      // F12
      if (code === 123) { e.preventDefault(); return false; }

      // Ctrl+Shift+I / J / C  (Windows/Linux)
      // Cmd+Opt+I / J / C    (Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (key === 'i' || key === 'j' || key === 'c' || code === 73 || code === 74 || code === 67) {
          e.preventDefault();
          return false;
        }
      }
      // Cmd+Opt+I / J / C  (Mac, no Shift)
      if (e.metaKey && e.altKey) {
        if (key === 'i' || key === 'j' || key === 'c' || code === 73 || code === 74 || code === 67) {
          e.preventDefault();
          return false;
        }
      }
      // Ctrl+U (view source)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (key === 'u' || code === 85)) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+K (Firefox web console)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'k' || code === 75)) {
        e.preventDefault();
        return false;
      }
    } catch (err) {
      e.preventDefault();
      return false;
    }
  }, true);

  // ---------- 4. DISABLE DRAG OF IMAGES / LINKS ----------
  document.addEventListener('dragstart', function (e) {
    e.preventDefault();
    return false;
  }, true);

  // ---------- 5. DISABLE TEXT SELECTION (extra defence) ----------
  // CSS already does -webkit-user-select: none; this is JS backup
  document.addEventListener('selectstart', function (e) {
    // Allow selection inside input/textarea so helpers can edit
    var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    e.preventDefault();
    return false;
  }, true);

  // ---------- 6. DEVTOOLS DETECTION (SIZE + DEBUGGER) ----------
  // Two techniques combined:
  //  a) Size threshold — devtools usually docks and changes window size dramatically
  //  b) debugger; statement timing — when devtools is open, the debugger statement
  //     pauses execution, making the time diff large
  var devtoolsOpen = false;
  var blankStyleEl = null;

  function applyBlankScreen() {
    if (blankStyleEl) return;
    blankStyleEl = document.createElement('style');
    blankStyleEl.id = '__edm_blank';
    blankStyleEl.textContent = [
      'body > * { display: none !important; }',
      'body::after {',
      '  content: "Session suspended. Please close developer tools and refresh.";',
      '  display: flex !important; align-items: center; justify-content: center;',
      '  position: fixed; inset: 0; background: #0f1117; color: #f87171;',
      '  font-family: Poppins, sans-serif; font-size: 14px; text-align: center;',
      '  padding: 24px; z-index: 2147483647;',
      '}'
    ].join('\n');
    document.head.appendChild(blankStyleEl);
  }

  function removeBlankScreen() {
    if (blankStyleEl && blankStyleEl.parentNode) {
      blankStyleEl.parentNode.removeChild(blankStyleEl);
      blankStyleEl = null;
    }
  }

  function checkDevtoolsBySize() {
    // Heuristic: huge gap between outer and inner dimensions usually means docked devtools
    var wDiff = window.outerWidth - window.innerWidth;
    var hDiff = window.outerHeight - window.innerHeight;
    // Threshold > 200px in either direction (excluding normal browser chrome)
    return (wDiff > 200) || (hDiff > 250);
  }

  function checkDevtoolsByDebugger() {
    // debugger; statement pauses only when devtools is open.
    // Measure time before/after — if > 100ms, devtools is open.
    var start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    var end = performance.now();
    return (end - start) > 100;
  }

  function scan() {
    try {
      var open = checkDevtoolsBySize() || checkDevtoolsByDebugger();
      if (open && !devtoolsOpen) {
        devtoolsOpen = true;
        applyBlankScreen();
      } else if (!open && devtoolsOpen) {
        devtoolsOpen = false;
        removeBlankScreen();
      }
    } catch (e) {}
  }

  // Run periodically. The debugger check naturally throttles itself
  // (pauses when devtools open). 1500ms is a good balance.
  setInterval(scan, 1500);
  // Initial run after a small delay (let the page paint first)
  setTimeout(scan, 800);

  // ---------- 7. CLEAR MEMORY ON UNLOAD ----------
  window.addEventListener('beforeunload', function () {
    try {
      // Attempt to clear sensitive globals (best effort)
      // List of known sensitive globals — extend if needed
      var sensitive = ['usersData', 'allMessagesData', 'currentHostData', 'currentHelper'];
      for (var i = 0; i < sensitive.length; i++) {
        try { window[sensitive[i]] = null; } catch (e) {}
      }
    } catch (e) {}
  });

  // ---------- 8. BLOCK DEVTOOLS via toString trick ----------
  // Some devtools inject /override certain object methods.
  // Override Object.defineProperty's toString to detect tampering.
  // (Subtle defence, not a primary measure.)
  try {
    var origToString = Function.prototype.toString;
    Function.prototype.toString = function () {
      // If a devtools library is overriding our functions, calling
      // toString on them returns something we can fingerprint.
      // For now, just call original. (Hook for future expansion.)
      return origToString.call(this);
    };
  } catch (e) {}

  // ---------- 9. PREVENT IFRAME EMBEDDING (clickjacking defence) ----------
  if (window.top !== window.self) {
    // Page is being embedded — bail out
    try { window.top.location = window.self.location; } catch (e) {
      document.body.innerHTML = '';
    }
  }

})();
