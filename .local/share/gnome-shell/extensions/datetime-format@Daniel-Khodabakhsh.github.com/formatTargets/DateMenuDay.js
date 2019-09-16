const name = {
	en: "Date Menu: Day",
	fr: "Menu de date: Jour",
	ja: "日付メニュー：日"
};

const defaultFormat = "%A";

let dayLabel;
let dateTimeDisplay;

function init() {
	dayLabel = imports.ui.main.panel.statusArea.dateMenu._date._dayLabel;
	dateTimeDisplay = new imports.gi.St.Label({
		style_class: "day-label",
		x_align: imports.gi.Clutter.ActorAlign.START
	});
}

function enable() {
	dayLabel.hide();
	dayLabel.get_parent().insert_child_below(dateTimeDisplay, dayLabel);
}

function disable() {
	dayLabel.show();
	dayLabel.get_parent().remove_child(dateTimeDisplay);
}

function update(format) {
	dateTimeDisplay.set_text(format);
}