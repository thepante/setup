///
/// prefs.js - Preferences for the extension, accessible via gnome-tweak-tool.
///

const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const extension = imports.misc.extensionUtils.getCurrentExtension();
const Utilities = extension.imports.Utilities;

const languageFolder = "languages";

// Array.prototype.find polyfill
// TODO: Remove this in future versions of gnome which supports Array.prototype.find().
// https://tc39.github.io/ecma262/#sec-array.prototype.find
if (!Array.prototype.find) {
	Object.defineProperty(Array.prototype, 'find', {
		value: function(predicate) {
			// 1. Let O be ? ToObject(this value).
			if (this == null) {
				throw new TypeError('"this" is null or not defined');
			}

			var o = Object(this);

			// 2. Let len be ? ToLength(? Get(O, "length")).
			var len = o.length >>> 0;

			// 3. If IsCallable(predicate) is false, throw a TypeError exception.
			if (typeof predicate !== 'function') {
				throw new TypeError('predicate must be a function');
			}

			// 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
			var thisArg = arguments[1];

			// 5. Let k be 0.
			var k = 0;

			// 6. Repeat, while k < len
			while (k < len) {
				// a. Let Pk be ! ToString(k).
				// b. Let kValue be ? Get(O, Pk).
				// c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
				// d. If testResult is true, return kValue.
				var kValue = o[k];
				if (predicate.call(thisArg, kValue, k, o)) {
					return kValue;
				}
				// e. Increase k by 1.
				k++;
			}

			// 7. Return undefined.
			return undefined;
		}
	});
}

///
/// Get the full file path of a in the extension.
///
/// @param {string} file - Name of the file who path is needed.
/// @return {string} Full path to file.
///
function filePath(file) {
	return extension.path + "/" + file;
}

///
/// Check if files exists.
///
/// @param {string} file - File whose existance is checked.
/// @return {boolean} Boolean representing if the file exists.
///
function fileExists(file) {
	return GLib.file_test(filePath(file), GLib.FileTest.EXISTS);
}

///
/// Read file contents.
///
/// @param {string} file - File contents to read.
/// @return {string} File contents.
///
function readFile(file) {
	return String(GLib.file_get_contents(filePath(file))[1]);
}

///
/// Initialising function, called before buildPrefsWidget().
///
function init() {}

///
/// Create and return Gtk.Widget to display as the preferences.
///
/// @return {Gtk.Widget} Widget to display.
///
function buildPrefsWidget() {
	const settings = new extension.imports.Settings.Class();

	const gladeFile = readFile("preferences.glade");
	const builder = Utilities.getBuilder(gladeFile);
	const preferencesBox = builder.get_object("preferences");
	const formatTargetsBox = builder.get_object("preferencesFormatTargetsBox");

	// Load language
	const language = JSON.parse(
		readFile(
			languageFolder
			+ "/"
			+ (GLib
				.get_language_names()
				.reduce((accumulator, currentValue) =>
					accumulator || GLib
						.get_locale_variants(currentValue)
						.find((languageCode) => 
							fileExists(languageFolder + "/" + languageCode + ".json")
						),
					""
				) || "en"
			)
			+ ".json"
		)
	);

	// Set stylesheet
	const cssProvider = new Gtk.CssProvider();
	cssProvider.load_from_path(filePath("preferences.css"));
	Gtk.StyleContext.add_provider_for_screen(imports.gi.Gdk.Screen.get_default(), cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

	// Create edit window
	const editWindow = new extension.imports.EditWindow.Class(preferencesBox, gladeFile, settings, language);

	// Generate format options
	extension.metadata.formatTargets.forEach((formatTarget) => extension.imports.FormatTarget.create(formatTargetsBox, formatTarget, Utilities.getBuilder(gladeFile), settings, editWindow));

	return preferencesBox;
}