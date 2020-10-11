/* 	No Dash in Overview
	(c) fthx 2020
	License: GPL v3
*/

const Main = imports.ui.main;

let originalDashWidth;

function init() {
}

function enable() {
	originalDashWidth = Main.overview.dash.width;
	Main.overview.dash.width = 8;
	Main.overview.dash.hide();
}

function disable() {
	Main.overview.dash.width = originalDashWidth;
	Main.overview.dash.show();
}

