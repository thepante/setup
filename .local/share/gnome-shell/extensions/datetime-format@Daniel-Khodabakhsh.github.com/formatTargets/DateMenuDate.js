const name = {
	en: "Date Menu: Date",
	fr: "Menu de date: Date",
	ja: "日付メニュー：日付"
};

const defaultFormat = "%B %e %Y";

let dateLabel;
let dateTimeDisplay;

function init() {
	dateLabel = imports.ui.main.panel.statusArea.dateMenu._date._dateLabel;
	dateTimeDisplay = new imports.gi.St.Label({
		style_class: "date-label"
	});
}

function enable() {
	dateLabel.hide();
	dateLabel.get_parent().insert_child_below(dateTimeDisplay, dateLabel);
}

function disable() {
	dateLabel.show();
	dateLabel.get_parent().remove_child(dateTimeDisplay);
}

function update(format) {
	dateTimeDisplay.set_text(format);
}