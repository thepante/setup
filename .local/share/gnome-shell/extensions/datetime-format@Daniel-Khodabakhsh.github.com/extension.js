///
/// entension.js - Main extension code.
///

const GLib = imports.gi.GLib;

const extension = imports.misc.extensionUtils.getCurrentExtension();
const formatTargets = extension.metadata.formatTargets;
const formatTargetObjects = extension.imports.formatTargets;
const settings = new extension.imports.Settings.Class();
const Utilities = extension.imports.Utilities;

let activeTargets = {};
let updateTargetsTimeoutID = 0;

///
/// Initialising function
///
function init() {
	formatTargets.forEach((formatTarget) => formatTargetObjects[formatTarget].init());
}

///
/// Update all enabled format targets.
///
/// @return {boolean} Always returns true to loop.
///
function updateTargets() {
	formatTargets.forEach((formatTarget) => {
		const formatTargetObject = formatTargetObjects[formatTarget];

		if (settings.getToggle(formatTarget)) {
			if (!activeTargets[formatTarget]) {
				activeTargets[formatTarget] = true;
				formatTargetObject.enable();
			}

			formatTargetObject.update(Utilities.dateTimeFormat(settings.getFormat(formatTarget) || formatTargetObject.defaultFormat));
		} else if (activeTargets[formatTarget]) {
			activeTargets[formatTarget] = false;
			formatTargetObject.disable();
		}
	});

	return true;
}

///
/// Enable, called when extension is enabled or when screen is unlocked.
///
function enable() {
	activeTargets = {};
	updateTargetsTimeoutID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, updateTargets);
}

///
/// Disable, called when extension is disabled or when screen is locked.
///
function disable() {
	GLib.Source.remove(updateTargetsTimeoutID);
	updateTargetsTimeoutID = 0;

	// Disable all active targets
	for (var formatTarget in activeTargets) {
		if (activeTargets[formatTarget]) {
			formatTargetObjects[formatTarget].disable();
		}
	}
}