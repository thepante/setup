/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * xletSettings.js - A library to provide a Side Page to shoe the xlets settings in Gnome Classic Settings -
 * ========================================================================================================
 */

const Lang = imports.lang;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const SettingsWidgets = cimports.settings.settingsWidgets;
const JsonSettingsWidgets = cimports.settings.jsonSettingsWidgets;
const Config = cimports.settings.config;

const MyExtension = imports.misc.extensionUtils.getCurrentExtension();
function _(str) {
    let resultConf = Gettext.dgettext(MyExtension.uuid, str);
    if(resultConf != str) {
        return resultConf;
    }
    return Gettext.gettext(str);
};

const home = GLib.get_home_dir();
const translations = {};

const XLET_SETTINGS_WIDGETS = {
    "entry"             :   "JSONSettingsEntry",
    "textview"          :   "JSONSettingsTextView",
    "checkbox"          :   "JSONSettingsSwitch", // deprecated: please use switch instead
    "switch"            :   "JSONSettingsSwitch",
    "spinbutton"        :   "JSONSettingsSpinButton",
    "filechooser"       :   "JSONSettingsFileChooser",
    "scale"             :   "JSONSettingsRange",
    "radiogroup"        :   "JSONSettingsComboBox", // deprecated: please use combobox instead
    "combobox"          :   "JSONSettingsComboBox",
    "colorchooser"      :   "JSONSettingsColorChooser",
    "fontchooser"       :   "JSONSettingsFontButton",
    "soundfilechooser"  :   "JSONSettingsSoundFileChooser",
    "iconfilechooser"   :   "JSONSettingsIconChooser",
    "tween"             :   "JSONSettingsTweenChooser",
    "effect"            :   "JSONSettingsEffectChooser",
    "datechooser"       :   "JSONSettingsDateChooser",
    "keybinding"        :   "JSONSettingsKeybinding"
};

const XLETSettingsButton = new GObject.Class({
    Name: 'ClassicGnome.XLETSettingsButton',
    GTypeName: 'ClassicGnomeXLETSettingsButton',
    Extends: Gtk.Button,

    _init: function(info, uuid, instance_id, proxy) {
        this.parent({ label: info.description });
        this.uuid = uuid;
        this.instance_id = instance_id;
        this.xletCallback = info.callback.toString();
        this.proxy = proxy;
    },

    on_activated: function() {
        this.proxy.activateCallback(this.xletCallback, this.uuid, this.instance_id);
    },
});

function translate(uuid, string) {
    //check for a translation for this xlet
    if (!(uuid in translations)) {
        Gettext.textdomain(uuid);
        try {
           Gettext.bindtextdomain(uuid, GLib.build_filenamev([GLib.get_user_data_dir(), "locale"]));
           translations[uuid] = Gettext.gettext;
        } catch(eg) {
            try {
                Gettext.bindtextdomain(uuid, "/usr/share/locale");
                translations[uuid] = Gettext.gettext;
            } catch(e) {
                translations[uuid] = null;
            }
        }
    }

    //do not translate whitespaces
    string = string.trim();
    if (string.length === 0) {
        return string;
    }

    if (translations[uuid]) {
        let result = translations[uuid](string);
        try {
            result = result.decode("utf-8");
        } catch(e) {}

        if (result != string) {
            return result;
        }
    }
    return _(string);
}

const XLetSidePage = new GObject.Class({
    Name: 'ClassicGnome.XLetSidePage',
    GTypeName: 'ClassicGnomeXLetSidePage',
    Extends: SettingsWidgets.SidePage,

    _init: function(argv, window, context_box, module) {
        let keywords = _("extension, settings, configuration");
        this.parent("Settings", "gnome-settings", keywords, 2, context_box, false, false, "", argv, window, module);
        this.type = "extension";/*argv[1]*/;
        this.uuid = argv[2];
        this.instanceId = argv[3];
        this.selected_instance = null;
        this.proxy = global.remoteSettings;
    },

    load: function() {
        if (!this.isLoaded) {
            SettingsWidgets.SidePage.prototype.load.call(this);
            this.load_xlet_data();
            this.buildData();
            if (this.load_instances()) {
                //this.window.show_all();
                if (this.instanceId && (this.instance_info.length > 1)) {
                    for (let info in this.instance_info) {
                        if (info.id == this.instanceId) {
                            this.set_instance(info);
                            break;
                        }
                    }
                }
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, Lang.bind(this, function() {
                    let id = 0;
                    if(this.selected_instance || (this.selected_instance !== undefined))
                        id = this.selected_instance.id
                    this.proxy.highlightXlet(this.uuid, id, true);
                }));

            }
        }
    },

    _listDir: function(path) {
        let dir = Gio.file_new_for_path(path);
        let children = dir.enumerate_children('standard::name,standard::type',
                                              Gio.FileQueryInfoFlags.NONE, null);
        let result = [];
        let info;
        while ((info = children.next_file(null)) != null) {
            if (info.get_file_type() == Gio.FileType.REGULAR)
                result.push(info.get_name());
        }
        return result;
    },

    load_xlet_data: function() {
        this.xlet_dir = GLib.build_filenamev([global.rootdatadir, this.type+"s", this.uuid]);
        if (!Gio.file_new_for_path(this.xlet_dir).query_exists(null)) {
            this.xlet_dir = GLib.build_filenamev([global.userclassicdatadir, this.type+"s", this.uuid]);
        }
        let jsonFile = Gio.file_new_for_path("%s/metadata.json".format(this.xlet_dir));
        if (jsonFile.query_exists(null)) {
            let [ok, raw_data] = GLib.file_get_contents(jsonFile.get_path());
            this.xlet_meta = JSON.parse(raw_data);
        } else {
            let error = "Could not find %s metadata for uuid %s - are you sure it's installed correctly?".format(this.type, this.uuid);
            global.logError(error);
            //this.showError(error);
            return false;
        }
        return true;
    },

    buildData: function() {
        this.vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this.vbox.expand = true;
        this.add_widget(this.vbox);

        let toolbar = new Gtk.Toolbar();
        toolbar.get_style_context().add_class("primary-toolbar");
        this.vbox.add(toolbar);

        let toolitem = new Gtk.ToolItem();
        toolitem.set_expand(true);
        toolbar.add(toolitem);
        let toolbutton_box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        toolitem.add(toolbutton_box);
        let instance_button_box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        instance_button_box.get_style_context().add_class("linked");
        toolbutton_box.pack_start(instance_button_box, false, false, 0);

        let imageNew = new Gtk.Image ({ icon_name: "go-previous-symbolic", icon_size: Gtk.IconSize.BUTTON });
        this.prev_button = new Gtk.Button({ image: imageNew });
        this.prev_button.set_tooltip_text(_("Previous instance"));
        instance_button_box.add(this.prev_button);

        imageNew = new Gtk.Image ({ icon_name: "go-next-symbolic", icon_size: Gtk.IconSize.BUTTON });
        this.next_button = new Gtk.Button({ image: imageNew });
        this.next_button.set_tooltip_text(_("Next instance"));
        instance_button_box.add(this.next_button);

        this.stack_switcher = new Gtk.StackSwitcher();
        toolbutton_box.set_center_widget(this.stack_switcher);

        /*this.menu_button = new Gtk.MenuButton();
        let image = new Gtk.Image ({ icon_name: "open-menu-symbolic", icon_size: Gtk.IconSize.BUTTON });
        this.menu_button.add(image);
        this.menu_button.set_tooltip_text(_("More options"));
        toolbutton_box.pack_end(this.menu_button, false, false, 0);

        let menu = new Gtk.Menu();
        menu.set_halign(Gtk.Align.END);

        //restore_option = new Gtk.MenuItem(_("Import from a file"));
        //menu.push(restore_option);
        //restore_option.connect("activate", this.restore);
        //restore_option.show();

        //backup_option = new Gtk.MenuItem(_("Export to a file"));
        //menu.push(backup_option);
        //backup_option.connect("activate", this.backup);
        //backup_option.show();

        //reset_option = new Gtk.MenuItem(_("Reset to defaults"));
        //menu.push(reset_option);
        //reset_option.connect("activate", this.reset);
        //reset_option.show();

        this.menu_button.set_popup(menu);*/

        let scw = new Gtk.ScrolledWindow();
        scw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.vbox.pack_start(scw, true, true, 0);
        this.instance_stack = new Gtk.Stack();
        scw.add(this.instance_stack);

        if ("icon" in this.xlet_meta) {
            this.topWindow.set_icon_name(this.xlet_meta["icon"]);
        } else {
            let icon_path = GLib.build_filenamev([this.xlet_dir, "icon.png"]);
            if (Gio.file_new_for_path(icon_path).query_exists(null))
                this.topWindow.set_icon_from_file(icon_path);
        }

        this.topWindow.set_title(translate(this.uuid, this.xlet_meta["name"]));
        this.prev_button.connect("clicked", Lang.bind(this, this.previous_instance));
        this.next_button.connect("clicked", Lang.bind(this, this.next_instance));
        this.topWindow.connect("delete-event", Lang.bind(this, this.appQuit));
    },

    appQuit: function() {
        if (this.proxy && this.selected_instance) {
            this.proxy.highlightXlet(this.uuid, this.selected_instance.id, false);
        }
    },

    load_instances: function() {
        this.instance_info = [];
        let path = [GLib.get_home_dir(), Config.USER_DOMAIN_FOLDER, Config.USER_CONFIG_FOLDER, this.uuid].join("/");
        if(!Gio.file_new_for_path(path).query_exists(null)) {
            let error = "Could not find %s metadata for uuid %s - are you sure it's installed correctly?".format(this.type, this.uuid);
            global.logError(error);
            //this.showError(error);
            return false;
        }
        let instances = this._listDir(path).sort();

        if (instances.length < 2) {
            this.prev_button.set_no_show_all(true);
            this.next_button.set_no_show_all(true);
        }

        for (let pos in instances) {
            let instance = instances[pos];
            let instance_id = instance.substring(0, instance.length - 5);
            let instancePath = GLib.build_filenamev([path, instance]);
            //global.log('INSTANCE PATH: ', instancePath)
            let settings = new JsonSettingsWidgets.JSONSettingsHandler(instance_id, instancePath, Lang.bind(this, this.notify_dbus));
            //global.log('SETTINGS: ', JSON.stringify(settings))
            let instance_box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
            this.instance_stack.add_named(instance_box, instance_id);

            let info = {"settings": settings, "id": instance_id};
            this.instance_info.push(info);

            let settings_map = settings.get_settings();
            let key = Object.keys(settings_map)[0];
            let first_key = settings_map[key];

            try {
                for (let setting in settings_map) {
                    if (setting == "__md5__") {
                        continue;
                    }
                    for (let key in settings_map[setting]) {
                        //global.log('KEY PAIR:', key, settings_map[setting][key])
                        if (["description", "tooltip", "units"].indexOf(key) != -1) {
                            try {
                                settings_map[setting][key] = translate(this.uuid, settings_map[setting][key]);
                            } catch(e) {}
                        } else if (key == "options") {
                            let new_opt_data = {};
                            let opt_data = settings_map[setting][key];
                            for (let option in opt_data) {
                                if (opt_data[option] == "custom") {
                                    continue;
                                }
                                new_opt_data[translate(this.uuid, option)] = opt_data[option];
                            }
                            //new_opt_data.sort();
                            settings_map[setting][key] = new_opt_data;
                        }
                    }
                }
            } finally {
                // if a layout is not expicitly defined, generate the settings
                // widgets based on the order they occur
                if ((first_key.hasOwnProperty('type')) && (first_key.type == "layout")) 
                    this.build_with_layout(settings_map, info, instance_box, first_key);
                else
                    this.build_from_order(settings_map, info, instance_box, first_key);

                if (this.selected_instance == null) {
                    this.selected_instance = info;
                    if (info.hasOwnProperty('stack'))
                        this.stack_switcher.set_stack(info.stack);
                }
            }
        }
           this.vbox.show_all();
        return true;
    },

    build_with_layout: function(settings_map, info, box, first_key) {
        //global.log('SETTINGS MAP: ', JSON.stringify(settings_map))
        let page_key, page_def, page, section_key, section_def, section, key, item, settings_type, widget;
        let layout = first_key;
        let page_stack = new SettingsWidgets.SettingsStack();
        box.pack_start(page_stack, true, true, 0);
        this.stack_switcher.show();
        info.stack = page_stack;
        
        for (let posPage in layout.pages) {
            page_key = layout.pages[posPage];
            page_def = layout[page_key];
            page = new SettingsWidgets.SettingsPage();
            page_stack.add_titled(page, page_key, translate(this.uuid, page_def.title))
            for (let posSection in page_def.sections) {
                section_key = page_def.sections[posSection];
                section_def = layout[section_key];
                section = page.add_section(translate(this.uuid, section_def.title));
                for (let posKey in section_def.keys) {
                    key = section_def.keys[posKey];
                    item = settings_map[key];
                    settings_type = item.type;
                    if (settings_type == "button") {
                        widget = new XLETSettingsButton(item, this.uuid, info.id, this.proxy);
                        section.add_row(widget);
                    } else if (settings_type == "label") {
                        widget = new SettingsWidgets.Text(translate(this.uuid, item.description));
                        section.add_row(widget);
                    } else if (XLET_SETTINGS_WIDGETS.hasOwnProperty(settings_type)) { // Changed to fix invalid 'in' operand error
                        //global.log("Is: " + global[XLET_SETTINGS_WIDGETS[settings_type]]);
                        //global.log(info.settings)
                        widget = new global[XLET_SETTINGS_WIDGETS[settings_type]](key, info.settings, item);
                        section.add_row(widget);
                    }
                }
            }
        }
    },

    build_from_order: function(settings_map, info, box, first_key) {
        let page = new SettingsWidgets.SettingsPage();
        box.pack_start(page, true, true, 0);

        // if the first key is not of type 'header' or type 'section' we need to make a new section
        let section, widget;
        if (!(first_key.type in ["header", "section"])) {
            section = page.add_section(_("Settings for %s").format(this.uuid));
        }

        for (let key in settings_map) {
            let item = settings_map[key];
            if (key == "__md5__") {
                continue;
            }

            if (item.hasOwnProperty('type')) {
                let settings_type = item.type;
                if (["header", "section"].indexOf(settings_type) !== -1) {
                    section = page.add_section(translate(this.uuid, item.description));
                } else if (settings_type == "button") {
                    widget = new XLETSettingsButton(item, this.uuid, info.id, this.proxy);
                    section.add_row(widget);
                } else if (settings_type == "label") {
                    widget = new SettingsWidgets.Text(translate(this.uuid, item.description));
                    section.add_row(widget);
                } else if (XLET_SETTINGS_WIDGETS.hasOwnProperty(settings_type)) { // Changed to fix invalid 'in' operand error
                    widget = new global[XLET_SETTINGS_WIDGETS[settings_type]](key, info.settings, item);
                    section.add_row(widget);
                }
            }
        }
    },

    notify_dbus: function(handler, key, value) {
        if (this.proxy) {
            this.proxy.updateSetting(this.uuid, handler.instance_id, key, JSON.stringify(value));
        }
    },

    set_instance: function(info) {
        this.instance_stack.set_visible_child_name(info.id);
        if (info.hasOwnProperty('stack')) {
            this.stack_switcher.set_stack(info.stack);
            let children = info.stack.get_children();
            if (children.length > 1) {
                info.stack.set_visible_child(children[0]);
            }
        }
        if (this.proxy) {
            this.proxy.highlightXlet(this.uuid, this.selected_instance.id, false);
            this.proxy.highlightXlet(this.uuid, info.id, true);
        }
        this.selected_instance = info;
    },

    previous_instance: function(args) {
        this.instance_stack.set_transition_type(Gtk.StackTransitionType.OVER_RIGHT);
        let index = this.instance_info.indexOf(this.selected_instance);
        if(index > 0) {
            this.set_instance(this.instance_info[index-1]);
        }
    },

    next_instance: function(args) {
        this.instance_stack.set_transition_type(Gtk.StackTransitionType.OVER_LEFT);
        let index = this.instance_info.indexOf(this.selected_instance);
        if (index != -1) {
            if (index == this.instance_info.length - 1) {
                index = 0;
            } else {
                index +=1;
            }
            this.set_instance(this.instance_info[index]);
        }
    },

    unpack_args: function(props) {
        args = {};
    },

    backup: function(args) {
        let dialog = new Gtk.FileChooserDialog({
           title: _("Select or enter file to export to"),
           flags: Gtk.FileChooserAction.SAVE,
           use_header_bar: true,
           select_multiple: false,
           transient_for: this.get_toplevel(),
        });
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        dialog.add_button(Gtk.STOCK_OPEN, Gtk.ResponseType.OK);

        dialog.set_do_overwrite_confirmation(true);
        let filter_text = new Gtk.FileFilter();
        filter_text.add_pattern("*.json");
        filter_text.set_name(_("JSON files"));
        dialog.add_filter(filter_text);

        let response = dialog.run();

        if (response == Gtk.ResponseType.ACCEPT) {
            let filename = dialog.get_filename();
            if (!(".json" in filename)) {
                filename = filename + ".json";
            }
            this.selected_instance.settings.save_to_file(filename);
        }
        dialog.destroy();
    },

    restore: function(args) {
        let dialog = new Gtk.FileChooserDialog({
           title: _("Select a JSON file to import"),
           flags: Gtk.FileChooserAction.OPEN,
           use_header_bar: true,
           select_multiple: false,
           transient_for: this.get_toplevel(),
        });
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        dialog.add_button(Gtk.STOCK_OPEN, Gtk.ResponseType.OK);

        let filter_text = new Gtk.FileFilter();
        filter_text.add_pattern("*.json");
        filter_text.set_name(_("JSON files"));
        dialog.add_filter(filter_text);

        let response = dialog.run();

        if (response == Gtk.ResponseType.OK) {
            let filename = dialog.get_filename();
            this.selected_instance.settings.load_from_file(filename);
        }

        dialog.destroy();
    },

    reset: function(args) {
        this.selected_instance.settings.reset_to_defaults();
    },

    showError: function(error) {
        if (this.proxy) {
            this.proxy.highlightXlet(this.uuid, this.selected_instance.id, false);
        }
        global.log("error " + error);
        //this.content_box.destroy();
    },
});
/*
if __name__ == "__main__" {
    import signal
    if (sys.argv.length < 3) {
        global.logError("Error: requres type and uuid");
        quit();
    }
    xlet_type = sys.argv[1];
    if (xlet_type not in ["applet", "desklet", "extension"]) {
        global.logError("Error: Invalid xlet type %s", sys.argv[1]);
        quit();
    }
    uuid = sys.argv[2];
    window = MainWindow(xlet_type, *sys.argv[2:]);
    signal.signal(signal.SIGINT, window.quit);
    Gtk.main();
}*/
