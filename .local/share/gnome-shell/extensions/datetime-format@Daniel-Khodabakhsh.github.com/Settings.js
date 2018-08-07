///
/// Settings class
///

///
/// Settings constructor.
///
const Class = function () {
	const Gio = imports.gi.Gio;
	const extension = imports.misc.extensionUtils.getCurrentExtension();

	const settings = new Gio.Settings({
		settings_schema: Gio.SettingsSchemaSource.new_from_directory(
			extension.path,
			Gio.SettingsSchemaSource.get_default(),
			false
		).lookup(extension.metadata.settingsSchema, true)
	});

	const formatKey = function (formatTarget) {
		return formatTarget.toLowerCase() + "-format";
	};

	const toggleKey = function (formatTarget) {
		return formatTarget.toLowerCase() + "-toggle";
	};

	///
	/// Get a target's format string.
	///
	/// @param {string} formatTarget - Format target name.
	/// @return {string} Format for the format target.
	///
	this.getFormat = function (formatTarget) {
		return settings.get_string(formatKey(formatTarget));
	};

	///
	/// Get a target's toggle state.
	///
	/// @param {string} formatTarget - Format target name.
	/// @return {boolean} Toggle state for the format target.
	///
	this.getToggle = function (formatTarget) {
		return settings.get_boolean(toggleKey(formatTarget));
	};

	///
	/// Set a target's format string.
	///
	/// @param {string} formatTarget - Format target name.
	/// @param {string} value - Format to set for the format target.
	///
	this.setFormat = function (formatTarget, value) {
		settings.set_string(formatKey(formatTarget), value);
	};

	///
	/// Set a target's toggle state.
	///
	/// @param {string} formatTarget - Format target name.
	/// @param {boolean} value - Toggle state to set for the format target.
	///
	this.setToggle = function (formatTarget, value) {
		settings.set_boolean(toggleKey(formatTarget), value);
	};
};