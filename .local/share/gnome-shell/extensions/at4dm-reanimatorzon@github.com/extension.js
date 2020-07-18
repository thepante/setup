"use strict";

function init() {}

function enable() {
  log("Alt-Tab for Dual Monitor Setup: enabling...");
  imports.ui.altTab._at4db_getWindows = imports.ui.altTab.getWindows;
  imports.ui.altTab.getWindows = function (workspace) {
    return imports.ui.altTab
      ._at4db_getWindows(workspace)
      .filter((w) => w.get_monitor() === global.display.get_current_monitor());
  };
  log("Alt-Tab for Dual Monitor Setup: enabled");
}

function disable() {
  log("Alt-Tab for Dual Monitor Setup: disabling...");
  imports.ui.altTab.getWindows = imports.ui.altTab._at4db_getWindows;
  delete imports.ui.altTab._at4db_getWindows;
  log("Alt-Tab for Dual Monitor Setup: disabled");
}
