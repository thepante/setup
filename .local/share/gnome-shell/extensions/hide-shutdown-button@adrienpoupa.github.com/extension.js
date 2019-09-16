
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Util = imports.misc.util;

let text, button, orgIndicator;

function _startGnomePrefs() {
    try {
        Main.Util.trySpawnCommandLine('gnome-session-quit --power-off');
    } catch(err) {
        Main.notify("Error");
    }
}

function init(extensionMeta) {  
}

function enable() {
    orgIndicator = Main.panel.statusArea.aggregateMenu._power;
    orgIndicator.indicators.hide();
}

function disable() {
    orgIndicator.indicators.show();
}

