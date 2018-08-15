/* ========================================================================================================
 * prefs.js - preferences
 * ========================================================================================================
 */
const Lang = imports.lang;
const Signals = imports.signals;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Notify = imports.gi.Notify;

const GioSSS = Gio.SettingsSchemaSource;

const MyExtension = imports.misc.extensionUtils.getCurrentExtension();
if(!window.cimports) window.cimports = MyExtension.imports;

const Convenience = cimports.convenience;
const Config = cimports.settings.config;
const ModulesLoader = cimports.settings.modulesLoader;
const SettingsDbusClient = cimports.settings.settingsDbusClient;

const WIN_WIDTH = 800;
const WIN_HEIGHT = 600;
const WIN_H_PADDING = 20;

const Gettext = imports.gettext;
function _(str) {
    let resultConf = Gettext.dgettext(MyExtension.uuid, str);
    if(resultConf != str) {
        return resultConf;
    }
    return Gettext.gettext(str);
};

const ClassicGnomePreferencesWidget = new GObject.Class({
    Name: 'ClassicGnome.ClassicGnomePreferencesWidget',
    GTypeName: 'ClassicGnomePreferencesWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        //this.settings = Convenience.getSettings('org.gnome.shell.extensions.classicGnome');
        this.modulesManager = new ModulesLoader.ModulesManager(this);
        this.modulesRequierd = ["get_side_page", "can_load_with_arguments"];
        this.module = null;
        this.content_box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        this.add(this.content_box);
        this.connect('map', Lang.bind(this, this._loadModule));
    },

    navegate: function(widget, id) {
        let module = this.modulesManager.getInstance(id);
        if(module) {
            let sidePage = module.get_side_page([], this.wind, this.content_box);
            if(sidePage) {
                this.subTitle = sidePage.name;
                try {
                    this.wind.set_icon_name(sidePage.icon);
                } catch (e) {
                    this.wind.set_icon_name('application-x-executable');
                }
                sidePage.build();
            }
            module.on_module_selected();
        }
    },

    _loadModule: function(widget, event) {
        if(!this.module) {
            try {
                let modulePath = GLib.build_filenamev([MyExtension.dir.get_path(), 'settings', 'modules']);
                this.modulesManager.scan(modulePath, "cg_", this.modulesRequierd);
                for(let name in this.modulesManager.instances) {
                    this.modulesManager.instances[name].set_handler(this);
                }
                this.module = this.modulesManager.getInstance("settings");
                let argv = ["settings", "applet", MyExtension.uuid, MyExtension.uuid];
                if(this.module && this.module.can_load_with_arguments(argv)) {
                    this.wind = this.get_toplevel(); //this.wind.is_toplevel();
                    this.sidePage = this.module.get_side_page(argv, this.get_toplevel(), this.content_box);
                    if(this.sidePage) {
                        if(this.sidePage.exec_name == "main") {
                            for(let name in this.modulesManager.instances) {
                                let sidep = this.modulesManager.instances[name].get_side_page(
                                    argv, this.wind, this.content_box
                                );
                                if(sidep && (sidep !== undefined) && sidep.module.have_direct_link()) {
                                    this.sidePage.addModuleSidePage(sidep,
                                        this.modulesManager.instances[name].name,
                                        this.modulesManager.instances[name].category
                                    );
                                }
                            }
                        }
                        this.module.on_module_selected();
                        this.maybe_resize(this.sidePage);
                    }
                }
            } catch(e) {
                global.notify("Error:", e.message, "dialog-error-symbolic");
            }
        }
    },

    maybe_resize: function(sidePage) {
        let [m, n] = this.content_box.get_preferred_size();
        this.bar_heights = 0;

        // Resize horizontally if the module is wider than the window
        let use_width = WIN_WIDTH;
        if (n.width > WIN_WIDTH) {
            use_width = n.width;
        }
        // Resize vertically depending on the height requested by the module
        let use_height = WIN_HEIGHT;
        let total_height = n.height + this.bar_heights + WIN_H_PADDING;
        if (!sidePage.size) {
            // No height requested, resize vertically if the module is taller than the window
            if (total_height > WIN_HEIGHT) {
                use_height = total_height;
            }
            //this.wind.resize(use_width, n.height + this.bar_heights + WIN_H_PADDING)
        } else if (sidePage.size > 0) {
            // Height hardcoded by the module
            //use_height = sidePage.size + this.bar_heights + WIN_H_PADDING;
        } else if (sidePage.size == -1) {
            // Module requested the window to fit it (i.e. shrink the window if necessary)
            use_height = total_height;
        }
        this.wind.resize(use_width, use_height);
    },
});

function init() {
    //Convenience.initTranslations();
    Notify.init ("org.classic.gnome.settings.daemon");
    window.global.getSettings = function(schema) {
        let schemaDir = GLib.build_filenamev([MyExtension.dir.get_path(), "schemas"]);
        let schemaSource = GioSSS.new_from_directory(schemaDir, GioSSS.get_default(), false);
        let schemaObj = schemaSource.lookup(schema, true);
        return new Gio.Settings({ settings_schema: schemaObj });
    };

    global.rootdatadir = MyExtension.dir.get_parent().get_parent().get_path();
    global.userclassicdatadir = GLib.build_filenamev([GLib.get_user_data_dir(), Config.USER_INSTALL_FOLDER]);
    global.remoteSettings = new SettingsDbusClient.ClientSettings();

    let iconTheme = Gtk.IconTheme.get_default();
    iconTheme.append_search_path(MyExtension.dir.get_path());

    global.notify = function(summary, body, iconName) {
        if(!iconName || (iconName === undefined))
            iconName = "dialog-error-symbolic";
        this.notification = new Notify.Notification ({
            "summary": summary,
            "body": body,
            "icon-name": iconName
        });
        this.notification.connect("closed", Lang.bind(this, function() {
            let reason = this.notification.get_closed_reason(); // The reason never seem to change.
            print("close reason: " + reason + "\n");
        }));
   
        this.notification.add_action("ok", _("Ok"), Lang.bind(this, function() {
            print("ok\n");
        }));
        this.notification.show();
    };
}

function buildPrefsWidget() {
    let widget = new ClassicGnomePreferencesWidget({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 5,
        border_width: 5
    });
    widget.show_all();

    return widget;
}
