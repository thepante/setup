const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Lang = imports.lang;

let _this;
let escAction;

//based on https://github.com/GNOME/gnome-shell/blob/gnome-3-20/js/ui/viewSelector.js
function esc(actor, event) {
		_this = this;
        if (Main.modalCount > 1)
            return Clutter.EVENT_PROPAGATE;

        let modifiers = event.get_state();
        let symbol = event.get_key_symbol();

        if (symbol == Clutter.KEY_Escape) {
            return escAction();
        } else if (this._shouldTriggerSearch(symbol)) {
            this.startSearch(event);
        } else if (!this._searchActive && !global.stage.key_focus) {
            if (symbol == Clutter.KEY_Tab || symbol == Clutter.KEY_Down) {
                this._activePage.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
                return Clutter.EVENT_STOP;
            } else if (symbol == Clutter.KEY_ISO_Left_Tab) {
                this._activePage.navigate_focus(null, Gtk.DirectionType.TAB_BACKWARD, false);
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
}

function init() {
	Main.overview.viewSelector._onStageKeyPress = esc;
}

function originalEscAction() {
	if (_this._searchActive)
        _this.reset();
    else if (_this._showAppsButton.checked)
        _this._showAppsButton.checked = false;
    else
        Main.overview.hide();
    return Clutter.EVENT_STOP;
}

function modifiedEscAction() {
	if (_this._searchActive)
        _this.reset();
    else
        Main.overview.hide();
    return Clutter.EVENT_STOP;
}

function enable() {
	escAction = modifiedEscAction;
}

function disable() {
	escAction = originalEscAction;
}
