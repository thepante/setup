///
/// Format target entry.
///

///
/// Create a format target entry with a toggle and settings button.
///
/// @param {Gtk.Box} container - Gtk.Box container object for this target.
/// @param {string} formatTarget - Format target name.
/// @param {Gtk.Builder} builder - Gtk.Builder to generate the widgets from the builder's glade file.
/// @param {Settings} settings - Settings object.
/// @param {EditWindow} editWindow - Edit window to show when the settings button is pressed.
///
const create = function (container, formatTarget, builder, settings, editWindow) {
	const GLib = imports.gi.GLib;
	const extension = imports.misc.extensionUtils.getCurrentExtension();
	const formatTargetObject = extension.imports.formatTargets[formatTarget];
	const Utilities = extension.imports.Utilities;

	const previewLabel = builder.get_object("formatTargetPreviewLabel");
	const toggleSwitch = builder.get_object("formatTargetToggleSwitch");

	const name = formatTargetObject.name && (
		GLib
			.get_language_names()
			.reduce((accumulator, currentValue) =>
				accumulator || GLib
					.get_locale_variants(currentValue)
					.reduce(
						(accumulator, currentValue) =>
							accumulator || formatTargetObject.name[currentValue],
						""
					),
				""
			) || formatTargetObject.name.en
		) || formatTarget;

	// Set options from settings
	builder.get_object("formatTargetTitleLabel").set_text(name);
	toggleSwitch.set_active(settings.getToggle(formatTarget));

	// Toggle switch settings logic
	toggleSwitch.connect("notify::active", function () {
		settings.setToggle(formatTarget, toggleSwitch.active);
	});

	// Update preview
	const updatePreview = function () {
		previewLabel.set_text(Utilities.dateTimeFormat(settings.getFormat(formatTarget), formatTargetObject.defaultFormat));
		return true;
	};

	GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, updatePreview);

	updatePreview();

	// Edit button click -> show edit window
	builder.get_object("formatTargetEditButton").connect("clicked", function () {
		editWindow.show(formatTarget, formatTargetObject, updatePreview, name);
	});

	container.pack_start(builder.get_object("formatTargetBox"), false, true, 0);
};