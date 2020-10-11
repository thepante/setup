function init(){
defaultValue = imports.ui.switcherPopup.POPUP_DELAY_TIMEOUT;
}

function enable(){
	imports.ui.switcherPopup.POPUP_DELAY_TIMEOUT = 0;
}

function disable(){
	imports.ui.switcherPopup.POPUP_DELAY_TIMEOUT = defaultValue;
}
