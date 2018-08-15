/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * gSettingsWidgets.js - A library to provide a gsettings connection to widgets - 
 * ========================================================================================================
 */
const Lang = imports.lang;
const Gettext = imports.gettext;
const Signals = imports.signals;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const _ = Gettext.gettext;

const SettingsWidgets = cimports.settings.settingsWidgets;

// Monkey patch Gio.Settings object
function __setitem__(key, value) {
    // set_value() aborts the program on an unknown key
    if (!(key in this))
        throw Error('unknown key: %r'.format(key));

    // determine type string of this key
    let range = this.get_range(key);
    let type_ = range.get_child_value(0).get_string();
    let v = range.get_child_value(1);
    let type_str;
    if (type_ == 'type') {
        // v is boxed empty array, type of its elements is the allowed value type
        assert(v.get_child_value(0).get_type_string().startswith('a'));
        type_str = v.get_child_value(0).get_type_string();
        type_str = type_str.substring(1, type_str.length);
    } else if (type_ == 'enum') {
        // v is an array with the allowed values
        assert(v.get_child_value(0).get_type_string().startswith('a'));
        type_str = v.get_child_value(0).get_child_value(0).get_type_string();
    } else if (type_ == 'flags') {
        // v is an array with the allowed values
        assert(v.get_child_value(0).get_type_string().startswith('a'));
        type_str = v.get_child_value(0).get_type_string();
    } else if (type_ == 'range') {
        // type_str is a tuple giving the range
        assert(v.get_child_value(0).get_type_string().startswith('('));
        type_str = v.get_child_value(0).get_type_string()[1];
    }

    if (!this.set_value(key, GLib.Variant(type_str, value)))
        throw Error("value '%s' for key '%s' is outside of valid range".format(value, key));
}

function bind_with_mapping(key, widget, prop, flags, key_to_prop, prop_to_key) {
    this._ignore_key_changed = false;

    function key_changed(settings, key) {
        if (this._ignore_key_changed)
            return;
        this._ignore_prop_changed = true;
        widget.set_property(prop, key_to_prop(this[key]));
        this._ignore_prop_changed = false;
    }

    function prop_changed(widget, param) {
        if (this._ignore_prop_changed)
            return;
        this._ignore_key_changed = true;
        this[key] = prop_to_key(widget[prop]);
        this._ignore_key_changed = false;
    }
    if (!(flags & (Gio.SettingsBindFlags.SET | Gio.SettingsBindFlags.GET))) { // ie Gio.SettingsBindFlags.DEFAULT
       flags |= Gio.SettingsBindFlags.SET | Gio.SettingsBindFlags.GET;
    }
    if (flags & Gio.SettingsBindFlags.GET) {
        key_changed(this, key);
        if (!(flags & Gio.SettingsBindFlags.GET_NO_CHANGES)) {
            this.connect('changed::' + key, key_changed);
        }
    }
    if (flags & Gio.SettingsBindFlags.SET) {
        widget.connect('notify::' + prop, prop_changed);
    }
    if (!(flags & Gio.SettingsBindFlags.NO_SENSITIVITY)) {
        this.bind_writable(key, widget, "sensitive", false);
    }
}

Gio.Settings.prototype.bind_with_mapping = bind_with_mapping;
Gio.Settings.__setitem__ = __setitem__;

const BinFileMonitor = new GObject.Class({
    Name: 'ClassicGnome.BinFileMonitor',
    GTypeName: 'ClassicGnomeBinFileMonitor',
    Signals: {
        'changed': {
            flags: GObject.SignalFlags.RUN_LAST
        },
    },

    _init: function() {
        this.changed_id = 0;
        let env = GLib.getenv("PATH");
        if (env == null)
            env = "/bin:/usr/bin:.";
        this.paths = env.split(":");
        this.monitors = [];

        let file, mon;
        for (let pos in this.paths) {
            file = Gio.File.new_for_path(this.paths[pos]);
            mon = file.monitor_directory(Gio.FileMonitorFlags.SEND_MOVED, null);
            mon.connect("changed", Lang.bind(this, this.queue_emit_changed));
            this.monitors.push(mon);
        }
    },

    _emit_changed: function() {
        this.emit("changed");
        this.changed_id = 0;
        return false;
    },

    queue_emit_changed: function(file, other, event_type, data) { //data=null
        if (this.changed_id > 0) {
            GLib.source_remove(this.changed_id);
            this.changed_id = 0;
        }
        this.changed_id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, this._emit_changed));
    },
});
Signals.addSignalMethods(BinFileMonitor.prototype);

var file_monitor = null;

function get_file_monitor() {
    if (file_monitor == null)
        file_monitor = new BinFileMonitor();
    return file_monitor;
}

const DependencyCheckInstallButton = new GObject.Class({
    Name: 'ClassicGnome.DependencyCheckInstallButton',
    GTypeName: 'ClassicGnomeDependencyCheckInstallButton',
    Extends: Gtk.Box,

    _init: function(checking_text, install_button_text, binfiles, final_widget, satisfied_cb) {//final_widget=null, satisfied_cb=null
        this.parent({ orientation: Gtk.Orientation.HORIZONTAL });

        this.binfiles = binfiles;
        this.satisfied_cb = satisfied_cb;

        this.checking_text = checking_text;
        this.install_button_text = install_button_text;

        this.stack = new Gtk.Stack();
        this.pack_start(this.stack, false, false, 0);

        this.progress_bar = new Gtk.ProgressBar()
        this.stack.add_named(this.progress_bar, "progress");

        this.progress_bar.set_show_text(true);
        this.progress_bar.set_text(this.checking_text);

        this.install_warning = new Gtk.Label({ label: install_button_text });
        let frame = new Gtk.Frame();
        frame.add(this.install_warning);
        frame.set_shadow_type(Gtk.ShadowType.OUT);
        frame.show_all();
        this.stack.add_named(frame, "install");

        if (final_widget) {
            this.stack.add_named(final_widget, "final");
        } else {
            this.stack.add_named(Gtk.Alignment(), "final");
        }
        this.stack.set_visible_child_name("progress");
        this.progress_source_id = 0;

        this.file_listener = get_file_monitor();
        this.file_listener_id = this.file_listener.connect("changed", Lang.bind(this, this.on_file_listener_ping));

        this.connect("destroy", Lang.bind(this, this._on_destroy));

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, this.check));
    },

    check: function() {
        this.start_pulse();
        let success = true;

        for (let pos in this.binfiles) {
            if (!GLib.find_program_in_path(this.binfiles[pos])) {
                success = false;
                break;
            }
        }
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, this.on_check_complete, success));

        return false;
    },

    pulse_progress: function() {
        this.progress_bar.pulse();
        return true;
    },

    start_pulse: function() {
        this.cancel_pulse();
        this.progress_source_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, Lang.bind(this, this.pulse_progress));
    },

    cancel_pulse: function() {
        if (this.progress_source_id > 0) {
            GLib.source_remove(this.progress_source_id);
            this.progress_source_id = 0;
        }
    },

    on_check_complete: function(result, data) { //data=null
        this.cancel_pulse();
        if (result) {
            this.stack.set_visible_child_name("final");
            if (this.satisfied_cb && (this.satisfied_cb !== undefined)) {
                this.satisfied_cb();
            }
        } else {
            this.stack.set_visible_child_name("install");
        }
    },

    on_file_listener_ping: function(monitor, data) { //data=null
        this.stack.set_visible_child_name("progress");
        this.progress_bar.set_text(this.checking_text);
        this.check();
    },

    _on_destroy: function(widget) {
        if(this.file_listener_id != 0) {
            this.file_listener.disconnect(this.file_listener_id);
            this.file_listener_id = 0;
        }
    },
});

const GSettingsDependencySwitch = new GObject.Class({
    Name: 'ClassicGnome.GSettingsDependencySwitch',
    GTypeName: 'ClassicGnomeGSettingsDependencySwitch',
    Extends: SettingsWidgets.SettingsWidget,

    _init: function(label, schema, key, dep_key, binfiles, packages) {// schema=null, key=null, dep_key=null, binfiles=null, packages=null
        this.parent(dep_key);

        this.binfiles = binfiles;
        this.packages = packages;

        this.content_widget = new Gtk.Alignment();
        this.label = new Gtk.Label({ label: label });
        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.switcher = new Gtk.Switch();
        this.switcher.set_halign(Gtk.Align.END);
        this.switcher.set_valign(Gtk.Align.CENTER);

        let pkg_string = "";
        for (let pkg in packages) {
            if (pkg_string != "")
                pkg_string += ", ";
            pkg_string += pkg;
        }
        this.dep_button = new DependencyCheckInstallButton(_("Checking dependencies"),
                                                           _("Please install: %s").format(pkg_string),
                                                           binfiles,
                                                           this.switcher);
        this.content_widget.add(this.dep_button);
        if (schema) {
            this.settings = this.get_settings(schema);
            this.settings.bind(key, this.switcher, "active", Gio.SettingsBindFlags.DEFAULT);
        }
    },
});

// This class is not meant to be used directly - it is only a backend for the
// settings widgets to enable them to bind attributes to gsettings keys. To use
// the gesttings backend, simply add the "GSettings" prefix to the beginning
// of the widget class name. The arguments of the backended class will be
// (label, schema, key, any additional widget-specific args and keyword args).
// (Note: this only works for classes that are gsettings compatible.)
//
// If you wish to make a new widget available to be backended, place it in the
// CAN_BACKEND list. In addition, you will need to add the following attributes
// to the widget class:
//
// bind_dir - (Gio.SettingsBindFlags) flags to define the binding direction or
//            None if you don't want the setting bound (for example if the
//            setting effects multiple attributes)
// bind_prop - (string) the attribute in the widget that will be bound to the
//             setting. This property may be omitted if bind_dir is null
// bind_object - (optional) the object to which to bind to (only needed if the
//               attribute to be bound is not a property of this.content_widget)
// map_get, map_set - (function, optional) a function to map between setting and
//                    bound attribute. May also be passed as a keyword arg during
//                    instantiation. These will be ignored if bind_dir=null
// set_rounding - (function, optional) To be used to set the digits to round to
//               if the setting is an integer

/*
const CSGSettingsBackend = new GObject.Class({
    Name: 'ClassicGnome.CSGSettingsBackend',
    GTypeName: 'ClassicGnomeCSGSettingsBackend',

    _init: function() {
    },

    bind_settings: function() {
        if (hasattr(this, "set_rounding")) {
            let vtype = this.settings.get_value(this.key).get_type_string();
            if (vtype in ["i", "u"])
                this.set_rounding(0);
        }
        let bind_object;
        if (hasattr(this, "bind_object")) {
            bind_object = this.bind_object;
        } else {
            bind_object = this.content_widget;
        }
        if (hasattr(this, "map_get") || hasattr(this, "map_set")) {
            this.settings.bind_with_mapping(this.key, bind_object, this.bind_prop, this.bind_dir, this.map_get, this.map_set);
        } else if (this.bind_dir != null) {
            this.settings.bind(this.key, bind_object, this.bind_prop, this.bind_dir);
        } else {
            this.settings.connect("changed::"+this.key, Lang.bind(this, this.on_setting_changed));
            this.on_setting_changed();
            this.connect_widget_handlers();
        }
    },

    set_value: function(value) {
        this.settings[this.key] = value;
    },

    get_value: function() {
        return this.settings[this.key];
    },

    get_range: function() {
        let range = this.settings.get_range(this.key);
        if (range[0] == "range")
            return [range[1][0], range[1][1]];
        return null;
    },

    on_setting_changed: function(args) {
        throw Error("SettingsWidget class must implement on_setting_changed().");
    },

    connect_widget_handlers: function(args) {
        if (this.bind_dir == null)
            throw Error("SettingsWidget classes with no .bind_dir must implement connect_widget_handlers().");
    },
});*/

function g_settings_factory(subclass) {
    const CSGSettingsBackend = new GObject.Class({
        Name: 'GSettings.' + subclass,
        GTypeName: 'GSettings' + subclass,
        Extends: eval('SettingsWidgets.' + subclass),

        _init: function(label, schema, key, args, kwargs) {
            this.key = key;
            if (!(schema in SettingsWidgets.settings_objects)) {
                SettingsWidgets.settings_objects[schema] = global.getSettings(schema);
            }
            this.settings = SettingsWidgets.settings_objects[schema];

            if(!this.on_setting_changed) {
                this.on_setting_changed = Lang.bind(this, function(argms) {
                    throw Error("SettingsWidget class must implement on_setting_changed().");
                });
            }

            if(!this.connect_widget_handlers) {
                this.connect_widget_handlers = Lang.bind(this, function(argms) {
                    if (this.bind_dir == null) {
                        throw Error("SettingsWidget classes with no .bind_dir must implement connect_widget_handlers().");
                    }
                });
            }
            if(kwargs && (kwargs !== undefined)) {
                if (kwargs.hasOwnProperty("map_get")) {
                    this.map_get = kwargs.map_get;
                    delete kwargs["map_get"];
                }
                if (kwargs.hasOwnProperty("map_set")) {
                    this.map_set = kwargs.map_set;
                    delete kwargs["map_set"];
                }
            } else {
                kwargs = {};
            }
            kwargs["label"] = label;
            this.parent(kwargs, args);
            this.bind_settings();
        },

        bind_settings: function() {
            if (this.hasOwnProperty("set_rounding")) {
                let vtype = this.settings.get_value(this.key).get_type_string();
                if (vtype in ["i", "u"])
                    this.set_rounding(0);
            }
            let bind_object;
            if (this.hasOwnProperty("bind_object")) {
                bind_object = this.bind_object;
            } else {
                bind_object = this.content_widget;
            }
            if (this.hasOwnProperty("map_get") || this.hasOwnProperty("map_set")) {
                this.settings.bind_with_mapping(this.key, bind_object, this.bind_prop, this.bind_dir, this.map_get, this.map_set);
            } else if (this.bind_dir != null) {
                this.settings.bind(this.key, bind_object, this.bind_prop, this.bind_dir);
            } else {
                this.settings.connect("changed::"+this.key, Lang.bind(this, this.on_setting_changed));
                this.on_setting_changed();
                this.connect_widget_handlers();
            }
        },

        set_value: function(value) {
            this.settings[this.key] = value;
        },

        get_value: function() {
            return this.settings[this.key];
        },

        get_range: function() {
            let range = this.settings.get_range(this.key);
            if (range[0] == "range")
                return [range[1][0], range[1][1]];
            return null;
        },
    });
    return CSGSettingsBackend;
}

for (let posWidget in SettingsWidgets.CAN_BACKEND) {
    let widget = SettingsWidgets.CAN_BACKEND[posWidget];
    window["GSettings"+widget] = g_settings_factory(widget);
    global.log("GSettings"+widget);
}
