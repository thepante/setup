/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * jsonSettingsWidgets.js - A backend for use a Json logic in Gnome Classic Settings -
 * ========================================================================================================
 */

const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const SettingsWidgets = cimports.settings.settingsWidgets;

//const Gettext = imports.gettext.domain(ExtensionUtils.metadata['gettext-domain']);
const _ = Gettext.gettext;

const JSON_SETTINGS_PROPERTIES_MAP = {
    "min"           : "mini",
    "max"           : "maxi",
    "step"          : "step",
    "units"         : "units",
    "select-dir"    : "dir_select",
    "height"        : "height",
    "tooltip"       : "tooltip",
    "possible"      : "possible",
    "dependency"    : "dep_key",
    "expand-width"  : "expand_width"
};

const JSONSettingsHandler = new GObject.Class({
    Name: 'ClassicGnome.JSONSettingsHandler',
    GTypeName: 'ClassicGnomeJSONSettingsHandler',

    _init: function(instance_id, filepath, notify_callback) { //notify_callback=null
        this.resume_timeout = null;
        this.notify_callback = notify_callback;

        if (filepath === undefined) {
            throw new Error('JSONSettingsHandler: filepath is undefined.');
        }
        this.instance_id = instance_id;
        this.filepath = filepath;
        this.file_obj = Gio.File.new_for_path(this.filepath);
        this.file_monitor = this.file_obj.monitor_file(Gio.FileMonitorFlags.SEND_MOVED, null);
        this.file_monitor.connect("changed",  Lang.bind(this, this.check_settings));

        this.bindings = {};
        this.listeners = {};
        this.deps = {};

        this.settings = null;
        this.settings = this.get_settings();
    },

    bind: function(key, obj, prop, direction, map_get, map_set) {//map_get=null, map_set=null
        if ((direction & (Gio.SettingsBindFlags.SET | Gio.SettingsBindFlags.GET)) == 0)
            direction |= Gio.SettingsBindFlags.SET | Gio.SettingsBindFlags.GET;

        let binding_info = {"obj": obj, "prop": prop, "dir": direction, "map_get": map_get, "map_set": map_set};

        if (!(key in this.bindings))
            this.bindings[key] = [];
        this.bindings[key].push(binding_info);

        if ((direction & Gio.SettingsBindFlags.GET) != 0) {
            this.set_object_value(binding_info, this.get_value(key));
        } 

        if ((direction & Gio.SettingsBindFlags.SET) != 0) {
            binding_info["oid"] = obj.connect("notify::"+prop, Lang.bind(this, this.object_value_changed, key));
        }
    },

    listen: function(key, callback) {
        if (!(key in this.listeners))
            this.listeners[key] = [];
        this.listeners[key].push(callback);
    },

    get_value: function(key) {
        return this.get_property(key, "value");
    },

    set_value: function(key, value) {
        if (value != this.settings[key].value) {
            this.settings[key].value = value;
            this.save_settings();
            if (this.notify_callback) {
                this.notify_callback(this, key, value);
            }
        }
    },

    get_property: function(key, prop) {
        return this.settings[key][prop];
    },

    has_property: function(key, prop) {
        return (prop in this.settings.keys());
    },

    has_key: function(key) {
        return (key in this.settings);
    },

    object_value_changed: function(obj, value, key) {
        for (let pos in this.bindings[key]) {
            let info = this.bindings[key][pos];
            if (obj == info["obj"]) {
                value = info["obj"][info["prop"]];
                if (("map_set" in info) && (info.map_set != null)) {
                    value = info.map_set(value);
                }
            } else {
                this.set_object_value(info, value);
            }
        }
        this.set_value(key, value);
    },

    set_object_value: function(info, value) {
        if (info.dir & (Gio.SettingsBindFlags.GET == 0))
            return;
        with (info["obj"]) {//FIXME: we really don't have that: freeze_notify() freeze_child_notify() ?
            if (("map_get" in info) && (info["map_get"] != null))
                value = info["map_get"](value);
            if (value != info["obj"][info["prop"]])
                info["obj"][info["prop"]] = value;
        }
    },

    check_settings: function(args) {
        let old_settings = this.settings;
        this.settings = this.get_settings();

        for (let key in this.bindings) {
            let new_value = this.settings[key].value;
            if (new_value != old_settings[key].value) {
                for (let pos in this.bindings[key]) {
                    let info = this.bindings[key][pos];
                    this.set_object_value(info, new_value);
                }
            }
        }

        for (let key in this.listeners) {
            let new_value = this.settings[key].value;
            if (new_value != old_settings[key].value) {
                let callback_list = this.listeners[key];
                for (let pos in callback_list) {
                    let callback = callback_list[pos];
                    callback(key, new_value);
                }
            }
        }
    },

    get_settings: function() {
        let jsonFile = Gio.file_new_for_path(this.filepath);
        if (jsonFile.query_exists(null)) {
            let [ok, raw_data] = GLib.file_get_contents(jsonFile.get_path());
            try {
                let settings = JSON.parse(raw_data);//, encoding=null, object_pairs_hook=collections.OrderedDict
                return settings;
            } catch(e) {
                throw Error("Failed to parse settings JSON data for file %s".format(this.filepath));
            }
        } else {
            let error = "Failed to parse settings JSON data for file %s".format(this.filepath);
            global.logError(error);
        }
        return this.settings;
    },

    save_settings: function() {
        this.pause_monitor();
        let file = Gio.file_new_for_path(this.filepath);
        if (file.query_exists(null)) {
            file['delete'](null);
        }

        let rawData = JSON.stringify(this.settings, null, 4);
        GLib.file_set_contents(this.filepath, rawData);
        this.resume_monitor();
    },

    pause_monitor: function() {
        this.file_monitor.cancel();
        this.handler = null;
    },

    resume_monitor: function() {
        if (this.resume_timeout) { // integer
            GLib.source_remove(this.resume_timeout);
        }
        this.resume_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, Lang.bind(this, this.do_resume));
    },

    do_resume: function() {
        this.file_obj = Gio.File.new_for_path(this.filepath);
        this.file_monitor = this.file_obj.monitor_file(Gio.FileMonitorFlags.SEND_MOVED, null);
        this.handler = this.file_monitor.connect("changed",  Lang.bind(this, this.check_settings));
        this.resume_timeout = null;
        return false;
    },

    reset_to_defaults: function() {
        for (let key in this.settings) {
            if (this.settings[key].hasOwnProperty('value')) {
                this.settings[key].value = this.settings[key].default;
                this.do_key_update(key);
            }
        }
        this.save_settings();
    },

    do_key_update: function(key) {
        if (this.bindings.hasOwnProperty(key)) {
            for (let pos in this.bindings[key]) {
                let info = this.bindings[key][pos];
                this.set_object_value(info, this.settings[key].value);
            }
        }

        if (key in this.listeners) {
            for (let callback in this.listeners[key]) {
                callback(key, this.settings[key].value);
            }
        }
    },

    load_from_file: function(filepath) {
        let jsonFile = Gio.file_new_for_path(filepath);
        if (jsonFile.query_exists(null)) {
            let [ok, raw_data] = GLib.file_get_contents(jsonFile.get_path());
            try {
                var settings = JSON.parse(raw_data);//, encoding=null, object_pairs_hook=collections.OrderedDict
            } catch(e) {
                throw Error("Failed to parse settings JSON data for file %s".format(this.filepath));
            }
        } else {
            let error = "Failed to parse settings JSON data for file %s".format(this.filepath);
            global.logError(error);
        }
        for (let key in this.settings) {
            if (!this.settings[key].hasOwnProperty('value')) {
                continue;
            } else if (settings.hasOwnProperty(key) && this.settings[key].hasOwnProperty('value')) {
                this.settings[key].value = settings[key].value;
                this.do_key_update(key);
            } else {
                global.logError("Skipping key %s: the key does not exist in %s or has no value".format(key, filepath));
            }
        }
        this.save_settings();
    },

    save_to_file: function(filepath) {
        let file = Gio.file_new_for_path(filepath);
        if (file.query_exists(null))
            file['delete'](null);
        let rawData = JSON.stringify(this.settings, null, 4);
        GLib.file_set_contents(this.filepath, rawData);
    },
});

function json_settings_factory(subclass) {
    const JSONSettingsBackend = new GObject.Class({
        Name: 'ClassicGnome.JSONSettingsBackend.'+subclass,
        GTypeName: 'ClassicGnomeJSONSettingsBackend'+subclass,
        Extends: eval('SettingsWidgets.' + subclass),

        _init: function(key, settings, properties) {
            this.key = key;
            this.settings = settings;
            this.state = properties.value; // Value of setting for this widdget

            if(!this.on_setting_changed) {
                this.on_setting_changed = Lang.bind(this, function(args) {
                    throw Error("SettingsWidget class must implement on_setting_changed().");
                });
            }
            if(!this.connect_widget_handlers) {
                this.connect_widget_handlers = Lang.bind(this, function(args) {
                    if (this.bind_dir == null) {
                        throw Error("SettingsWidget classes with no .bind_dir must implement connect_widget_handlers().");
                    }
                });
            }
            let kwargs = {};
            for (let prop in properties) {
                if (prop in JSON_SETTINGS_PROPERTIES_MAP) {
                    kwargs[JSON_SETTINGS_PROPERTIES_MAP[prop]] = properties[prop];
                } else if (prop == "options") {
                    kwargs.options = [];
                    for (let label in properties[prop]) {
                        kwargs.options.push([properties[prop][label], label]);
                    }
                }
            }
            kwargs.label = properties.description;
            this.parent(kwargs);
            // ... need to check state setting syntax for other classes, and add them here.
            this.attach();
        },

        set_dep_key: function(dep_key) {
            if (this.settings.has_key(dep_key)) {
                this.settings.bind(dep_key, this, "sensitive", Gio.SettingsBindFlags.GET);
            } else {
                global.logError("Ignoring dependency on key '%s': no such key in the schema".format(dep_key));
            }
        },

        attach: function() {
            if (this.hasOwnProperty("set_rounding") && this.settings.has_property(this.key, "round"))
                this.set_rounding(this.settings.get_property(this.key, "round"));
            let bind_object;
            if (this.hasOwnProperty("bind_object")) {
                bind_object = this.bind_object;
            } else {
                bind_object = this.content_widget;
            }
            if (this.bind_dir != null) {
                this.settings.bind(this.key, bind_object, this.bind_prop, this.bind_dir,
                                   this.hasOwnProperty("map_get") ? this.map_get : null,
                                   this.hasOwnProperty("map_set") ? this.map_set : null)
            } else {
                this.settings.listen(this.key, Lang.bind(this, this.on_setting_changed));
                this.on_setting_changed();
                this.connect_widget_handlers();
            }
        },

        set_value: function(value) {
            this.settings.set_value(this.key, value);
        },

        get_value: function() {
            return this.settings.get_value(this.key);
        },

        get_range: function() {
            let min = this.settings.get_property(this.key, "min");
            let max = this.settings.get_property(this.key, "max");
            return [min, max];
        },
    });
    return JSONSettingsBackend;
}

for (let posWidget in SettingsWidgets.CAN_BACKEND) {
    let widget = SettingsWidgets.CAN_BACKEND[posWidget];
    global["JSONSettings"+widget] = json_settings_factory(widget);
}
