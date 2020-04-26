const SwitcherPopup = imports.ui.switcherPopup;

function init() {
}

function enable() {
    SwitcherPopup.POPUP_DELAY_TIMEOUT = 0;
}

function disable() {
    SwitcherPopup.POPUP_DELAY_TIMEOUT = 150;
}