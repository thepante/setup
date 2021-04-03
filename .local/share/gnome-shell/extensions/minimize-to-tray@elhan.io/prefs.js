imports.gi.versions.Wnck = '3.0';
var prefs = (function (Gdk3_0, GdkPixbuf2_0, GLib2_0, Gtk3_0, Wnck3_0, Gio2_0) {
    'use strict';

    var ExtensionType;
    (function (ExtensionType) {
        ExtensionType[ExtensionType["SYSTEM"] = 1] = "SYSTEM";
        ExtensionType[ExtensionType["PER_USER"] = 2] = "PER_USER";
    })(ExtensionType || (ExtensionType = {}));
    var ExtensionState;
    (function (ExtensionState) {
        ExtensionState[ExtensionState["ENABLED"] = 1] = "ENABLED";
        ExtensionState[ExtensionState["DISABLED"] = 2] = "DISABLED";
        ExtensionState[ExtensionState["ERROR"] = 3] = "ERROR";
        ExtensionState[ExtensionState["OUT_OF_DATE"] = 4] = "OUT_OF_DATE";
        ExtensionState[ExtensionState["DOWNLOADING"] = 5] = "DOWNLOADING";
        ExtensionState[ExtensionState["INITIALIZED"] = 6] = "INITIALIZED";
        // Used as an error state for operations on unknown extensions,
        // should never be in a real extensionMeta object.
        ExtensionState[ExtensionState["UNINSTALLED"] = 99] = "UNINSTALLED";
    })(ExtensionState || (ExtensionState = {}));
    const getCurrentExtension = () => imports.misc.extensionUtils.getCurrentExtension();
    const getCurrentExtensionSettings = () => imports.misc.extensionUtils.getSettings();

    const logger = (prefix) => (content) => log(`[mtt] [${prefix}] ${content}`);
    const debug = logger('utils');
    const execute = async (command) => {
        const process = new Gio2_0.Subprocess({
            argv: ['bash', '-c', command],
            flags: Gio2_0.SubprocessFlags.STDOUT_PIPE,
        });
        process.init(null);
        return new Promise((resolve, reject) => {
            process.communicate_utf8_async(null, null, (_, result) => {
                const [, stdout, stderr] = process.communicate_utf8_finish(result);
                if (stderr) {
                    reject(stderr);
                }
                else if (stdout) {
                    resolve(stdout.trim());
                }
                else {
                    resolve();
                }
            });
        });
    };
    const getWindowClassName = async (xid) => {
        try {
            if (xid) {
                const xpropOut = await execute(`xprop -id ${xid} WM_CLASS`);
                if (xpropOut != null) {
                    return xpropOut.split('=')[1].split(',')[0].trim().split('"')[1];
                }
            }
        }
        catch (ex) {
            debug(`error occured while getting window className: ${ex}`);
        }
    };
    const getWindowXid = async () => {
        try {
            return execute('xdotool selectwindow');
        }
        catch (ex) {
            debug(`error occured while getting windowXid: ${ex}`);
        }
    };

    const debug$1 = logger('prefs');
    class Preferences {
        constructor() {
            var _a;
            this.mttData = [];
            this.extension = getCurrentExtension();
            this.settings = getCurrentExtensionSettings();
            // Create a parent widget
            this.widget = new Gtk3_0.Box();
            // Load ui from glade file
            this.builder = Gtk3_0.Builder.new_from_file(`${this.extension.path}/ui/prefs.glade`);
            // Connect all events
            this.builder.connect_signals_full((builder, object, signal, handler) => {
                object.connect(signal, this[handler].bind(this));
            });
            this.trackedClassesListBox = this.builder.get_object('tracked-classes-listbox');
            const settingsBox = this.builder.get_object('mtt-settings');
            this.widget.pack_start(settingsBox, true, true, 0);
            (_a = this.widget.get_parent_window()) === null || _a === void 0 ? void 0 : _a.set_title(this.extension.metadata.name);
            // Initialize values
            this.initValues();
        }
        initValues() {
            try {
                // Get the already saved data
                this.mttData = JSON.parse(this.settings.get_string('mtt-data'));
            }
            catch (_) {
                debug$1('could not parse the settings data, resetting it.');
                this.mttData = [];
            }
            // Create ui row for each item
            this.mttData.forEach((data) => this.addRow(data));
            debug$1('initialized values');
        }
        async onAddApplication() {
            try {
                // Get the window id and the window
                const windowId = await getWindowXid();
                if (!windowId) {
                    return;
                }
                // Get the class name
                const className = await getWindowClassName(windowId);
                // Check if we have a className
                if (!className) {
                    return;
                }
                // Check if class name is already included
                if (this.mttData.findIndex((data) => data.className === className) >= 0) {
                    return;
                }
                // Get the icon
                const icon = this.getIconFromWindow(windowId);
                const mttInfo = {
                    className,
                    enabled: true,
                    startHidden: false,
                    icon: icon && GLib2_0.base64_encode(icon.get_pixels()),
                    keybinding: [],
                };
                // Add row to list
                this.addRow(mttInfo);
                // Add data to mttData
                this.mttData.push(mttInfo);
            }
            catch (ex) {
                debug$1(`exception: ${ex}`);
            }
        }
        onSave() {
            this.settings.set_string('mtt-data', JSON.stringify(this.mttData));
            this.onClose();
        }
        onClose() {
            this.widget.get_toplevel().destroy();
        }
        addRow(info) {
            const rowBuilder = Gtk3_0.Builder.new_from_file(`${this.extension.path}/ui/row_template.glade`);
            // Get the template
            const row = rowBuilder.get_object('row-template');
            // Set the class name
            const classNameLabel = rowBuilder.get_object('class-name-label');
            classNameLabel.set_text(info.className);
            // Set the icon
            if (info.icon) {
                const iconImage = rowBuilder.get_object('icon-image');
                iconImage.set_from_pixbuf(this.createIcon(info.icon));
            }
            // Set the enabled switch
            const enabledSwitch = rowBuilder.get_object('enabled-switch');
            enabledSwitch.set_active(info.enabled);
            // Connect to state set event for changes
            enabledSwitch.connect('state-set', (_, state) => {
                const currentInfo = this.mttData.find((data) => data.className === info.className);
                if (currentInfo) {
                    currentInfo.enabled = state;
                }
            });
            // Connect remove event
            const removeButton = rowBuilder.get_object('remove-button');
            removeButton.connect('clicked', () => {
                this.trackedClassesListBox.remove(row);
                this.mttData = this.mttData.filter((data) => data.className !== info.className);
            });
            // Read keybinding widgets from builder
            const keybindingsContainer = rowBuilder.get_object('keybinding-container');
            const keybindingButton = rowBuilder.get_object('keybinding-button');
            const keybindingButtonImage = keybindingButton.get_child();
            const keybindingAddButton = rowBuilder.get_object('keybinding-add-button');
            const keybindingEntry = rowBuilder.get_object('keybinding-entry');
            const keybindingPopover = rowBuilder.get_object('keybinding-popover');
            // If keybinding is assigned to info, then show it in ui
            if (info.keybinding && info.keybinding.length > 0) {
                info.keybinding.forEach((key) => {
                    const label = new Gtk3_0.Label();
                    keybindingButton.set_tooltip_text('Remove keyboard shortcut');
                    keybindingButtonImage.set_from_icon_name('edit-undo-symbolic', Gtk3_0.IconSize.BUTTON);
                    label.get_style_context().add_class('keycap');
                    label.get_style_context().add_class('mtt-keybinding');
                    label.set_text(key);
                    label.show_all();
                    keybindingsContainer.add_child(rowBuilder, label, null);
                });
            }
            // Clear and toggle popover on button click
            keybindingButton.connect('clicked', () => {
                if (info.keybinding && info.keybinding.length > 0) {
                    debug$1('removing keybinding');
                    info.keybinding = [];
                    keybindingPopover.hide();
                    keybindingsContainer.get_children().forEach((child) => child.destroy());
                    keybindingButtonImage.set_from_icon_name('input-keyboard-symbolic', Gtk3_0.IconSize.BUTTON);
                    keybindingButton.set_tooltip_text('Add keyboard shortcut');
                }
                else {
                    debug$1('adding keybinding');
                    keybindingPopover.show();
                }
            });
            // Detect keys
            let keys = new Array();
            keybindingEntry.connect('key-press-event', (_, event) => {
                const keyVal = event.get_keyval()[1];
                let keyName = Gdk3_0.keyval_name(keyVal);
                if (!keyName) {
                    return;
                }
                debug$1(`pressed key: ${keyVal}/${keyName}`);
                // Check if pressed is supported or not
                if (this.isSupportedModifier(keyVal)) {
                    try {
                        keyName = `<${keyName.split('_')[0].toLowerCase()}>`;
                    }
                    catch (ex) {
                        return;
                    }
                }
                else if (!this.isSupportedAlphaNumericKey(keyVal)) {
                    return;
                }
                if (keys.findIndex((key) => key.value == keyVal) >= 0) {
                    return;
                }
                keys.push({
                    value: keyVal,
                    name: keyName,
                });
                keybindingEntry.keys = [...keys];
                keybindingEntry.set_text(`${keys.map((key) => key.name).join(' ')}`);
            });
            // Clear keys on key release
            keybindingEntry.connect('key-release-event', () => {
                keys = [];
            });
            // When clicked to `Done` button, save the keybinding
            keybindingAddButton.connect('clicked', () => {
                const keybindingArr = [...keybindingEntry.keys];
                keybindingEntry.keys = [];
                keybindingPopover.hide();
                keybindingEntry.set_text('');
                if (!keybindingArr) {
                    return;
                }
                if (keybindingArr.findIndex((key) => this.isSupportedModifier(key.value)) < 0 ||
                    keybindingArr.findIndex((key) => this.isSupportedAlphaNumericKey(key.value)) < 0) {
                    return;
                }
                info.keybinding = keybindingArr.map((key) => key.name);
                keybindingButton.set_tooltip_text('Remove keyboard shortcut');
                info.keybinding.forEach((key) => {
                    const label = new Gtk3_0.Label();
                    label.get_style_context().add_class('keycap');
                    label.get_style_context().add_class('mtt-keybinding');
                    label.set_text(key);
                    keybindingButtonImage.set_from_icon_name('edit-undo-symbolic', Gtk3_0.IconSize.BUTTON);
                    keybindingsContainer.add_child(rowBuilder, label, null);
                    label.show_all();
                });
            });
            // Set startHidden switch
            const startHiddenToggle = rowBuilder.get_object('start-hidden-toggle');
            startHiddenToggle.set_active(info.startHidden);
            startHiddenToggle.connect('toggled', () => {
                const currentInfo = this.mttData.find((data) => data.className === info.className);
                if (currentInfo) {
                    currentInfo.startHidden = startHiddenToggle.get_active();
                }
            });
            // Add to existing list
            this.trackedClassesListBox.insert(row, 0);
        }
        isSupportedModifier(keyVal) {
            const supportedModifiers = [Gdk3_0.KEY_Control_L, Gdk3_0.KEY_Control_R, Gdk3_0.KEY_Shift_L, Gdk3_0.KEY_Shift_R, Gdk3_0.KEY_Alt_L, Gdk3_0.KEY_Alt_R];
            return supportedModifiers.indexOf(keyVal) >= 0;
        }
        isSupportedAlphaNumericKey(keyVal) {
            const supportedAlphaNumericalRange = [
                [65, 90],
                [97, 122],
                [48, 57],
            ];
            return supportedAlphaNumericalRange.findIndex((range) => keyVal >= range[0] && keyVal <= range[1]) >= 0;
        }
        createIcon(iconBase64) {
            if (iconBase64) {
                return GdkPixbuf2_0.Pixbuf.new_from_bytes(GLib2_0.base64_decode(iconBase64), GdkPixbuf2_0.Colorspace.RGB, true, 8, 32, 32, 128);
            }
        }
        getIconFromWindow(xid) {
            var _a;
            (_a = Wnck3_0.Screen.get_default()) === null || _a === void 0 ? void 0 : _a.force_update();
            const window = Wnck3_0.Window.get(parseInt(xid));
            if (!window || window.get_icon_is_fallback()) {
                debug$1(`getting icon for window ${xid}`);
                // Get the icon from window
                const defaulIcon = Gtk3_0.IconTheme.get_default().lookup_icon('applications-system-symbolic', 32, Gtk3_0.IconLookupFlags.USE_BUILTIN);
                return defaulIcon === null || defaulIcon === void 0 ? void 0 : defaulIcon.load_icon();
            }
            return window.get_icon();
        }
    }
    const init = () => {
        debug$1('prefs initialized');
    };
    const buildPrefsWidget = () => {
        const prefs = new Preferences();
        const styleProvider = new Gtk3_0.CssProvider();
        styleProvider.load_from_path(`${prefs.extension.path}/stylesheet.css`);
        Gtk3_0.StyleContext.add_provider_for_screen(prefs.widget.get_screen(), styleProvider, Gtk3_0.STYLE_PROVIDER_PRIORITY_USER);
        prefs.widget.show_all();
        return prefs.widget;
    };
    var prefs = { init, buildPrefsWidget };

    return prefs;

}(imports.gi.Gdk, imports.gi.GdkPixbuf, imports.gi.GLib, imports.gi.Gtk, imports.gi.Wnck, imports.gi.Gio));
var init = prefs.init;
var buildPrefsWidget = prefs.buildPrefsWidget;
