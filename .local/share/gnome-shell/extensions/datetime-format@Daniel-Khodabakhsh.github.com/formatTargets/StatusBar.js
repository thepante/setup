const name = {
	en: "Status Bar",
	fr: "Barre d'état",
	ja: "ステータスバー"
};

const defaultFormat = "%c";

let clockDisplay;
let dateTimeDisplay;

function init() {
	clockDisplay = imports.ui.main.panel.statusArea.dateMenu._clockDisplay;
	dateTimeDisplay = new imports.gi.St.Label({
		y_align: imports.gi.Clutter.ActorAlign.CENTER
	});
}

function enable() {
	clockDisplay.hide();
	clockDisplay.get_parent().insert_child_below(dateTimeDisplay, clockDisplay);
}

function disable() {
	clockDisplay.show();
	clockDisplay.get_parent().remove_child(dateTimeDisplay);
}

function update(format) {
	dateTimeDisplay.set_text(format);
}