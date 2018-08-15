/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * settingsWidgets.js - A library for use Gtk.Widgets in Gnome Classic Settings -
 * ========================================================================================================
 */

const Gettext = imports.gettext;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GDesktopEnums = imports.gi.GDesktopEnums;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Params = imports.misc.params;

const KeybindingWidgets = cimports.settings.keybindingWidgets;
const ChooserButtonWidgets = cimports.settings.chooserButtonWidgets;
//const Gettext = Gettext.domain(ExtensionUtils.metadata['gettext-domain']);
const _ = Gettext.gettext;

const settings_objects = {};

const CAN_BACKEND = [
    "Switch", "SpinButton", "Entry", "TextView", "FontButton", "Range", "ComboBox",
    "ColorChooser", "FileChooser", "SoundFileChooser", "IconChooser", "TweenChooser",
    "EffectChooser", "DateChooser", "Keybinding"
];

const EditableEntry = new GObject.Class({
    Name: 'ClassicGnome.EditableEntry',
    GTypeName: 'ClassicGnomeEditableEntry',
    Extends: Gtk.Stack,
    Signals: {
        'changed': {
            flags: GObject.SignalFlags.RUN_LAST,
            param_types: [ GObject.TYPE_STRING ]
        },
    },

    _init: function() {
        this.parent();

        this.set_transition_type(Gtk.StackTransitionType.CROSSFADE);
        this.set_transition_duration(150);

        this.label = new Gtk.Label();
        this.entry = new Gtk.Entry();
        this.button = new Gtk.Button();

        this.button.set_alignment(1.0, 0.5);
        this.button.set_relief(Gtk.ReliefStyle.NONE);
        this.add_named(this.button, "button");
        this.add_named(this.entry, "entry");
        this.set_visible_child_name("button");
        this.editable = false;
        this.current_text = null;
        this.show_all();

        this.button.connect("released", Lang.bind(this, this._on_button_clicked));
        this.button.connect("activate", Lang.bind(this, this._on_button_clicked));
        this.entry.connect("activate", Lang.bind(this, this._on_entry_validated));
        this.entry.connect("changed", Lang.bind(this, this._on_entry_changed));
        this.entry.connect("focus-out-event", Lang.bind(this, this._on_focus_lost));
    },

    set_text: function(text) {
        this.button.set_label(text);
        this.entry.set_text(text);
        this.current_text = text;
    },

    _on_focus_lost: function(widget, event) {
        this.button.set_label(this.current_text);
        this.entry.set_text(this.current_text);

        this.set_editable(false);
    },

    _on_button_clicked: function(button) {
        this.set_editable(true);
        this.entry.grab_focus();
    },

    _on_entry_validated: function(entry) {
        this.set_editable(false);
        this.emit("changed", entry.get_text());
        this.current_text = entry.get_text();
    },

    _on_entry_changed: function(entry) {
        this.button.set_label(entry.get_text());
    },

    set_editable: function(editable) {
        if (editable)
            this.set_visible_child_name("entry");
        else
            this.set_visible_child_name("button");
        this.editable = editable;
    },

    set_tooltip_text: function(tooltip) {
        this.button.set_tooltip_text(tooltip);
    },

    get_editable: function() {
        return this.editable;
    },

    get_text: function() {
        return this.entry.get_text();
    },
});

const SidePage = new GObject.Class({
    Name: 'ClassicGnome.SidePage',
    GTypeName: 'ClassicGnomeSidePage',

    _init: function(name, icon, keywords, size, content_box, is_c_mod, is_standalone, exec_name, args, window, module) {
        //content_box = null  //size = null //is_c_mod = false  //is_standalone = false //exec_name = null //module=null

        this.name = name;
        this.icon = icon;
        this.widgets = [];
        this.is_c_mod = is_c_mod;
        this.is_standalone = is_standalone;
        this.exec_name = exec_name;
        this.module = module; // Optionally set by the module so we can call on_module_selected() on it when we show it.
        this.keywords = keywords;
        this.size = size;
        this.args = args;
        this.topWindow = window;
        this.builder = null;
        this.stack = null;
        this.isLoaded = false;
        if (this.module != null)
            this.module.loaded = false;

        if(!content_box || (content_box === undefined)) {
            content_box = new Gtk.Box({
                spacing: 20,
                orientation: Gtk.Orientation.VERTICAL,
                homogeneous: false,
                margin_left: 0,
                margin_top: 0,
                margin_bottom: 0,
                margin_right: 0
            });
        }
        this.content_box = content_box;
    },

    add_widget: function(widget) {
        this.widgets.push(widget);
    },

    set_argv: function(args) {
        this.args = args;
    },

    set_top_windows: function(windows) {
        this.topWindow = window;
    },

    load: function() {
       this.isLoaded = true;
    },

    build: function() {
        // Clear all the widgets from the content box
        if(!this.isLoading) {
            this.isLoading = true;
            let widgets = this.content_box.get_children();
            for (let pos in widgets)
                this.content_box.remove(widgets[pos]);

            if (this.module != null) {
                this.module.loaded = false;
                this.module.on_module_selected();
                this.module.loaded = true;
            }

            if (this.is_standalone) {
                //subprocess.Popen(this.exec_name.split());
                this.isLoading = false;
                return true;
            }

            // Add our own widgets
            for (let pos in this.widgets) {
                if (this.widgets[pos].hasOwnProperty('expand'))
                    this.content_box.pack_start(this.widgets[pos], true, true, 2);
                else
                    this.content_box.pack_start(this.widgets[pos], false, false, 2);
            }

            // C modules are sort of messy - they check the desktop type
            // (for Unity or GNOME) and show/hide UI items depending on
            // the result - so we cannot just show_all on the widget, it will
            // mess up these modifications - so for these, we just show the
            // top-level widget
            if (!this.is_c_mod) {
                this.content_box.show_all();
                try {
                    this.check_third_arg()
                } catch(e) {}
                this.isLoading = false;
                return false;
            }
            this.content_box.show();
            for (let child in this.content_box) {
                child.show();

                // C modules can have non-C parts. C parts are all named c_box
                if (child.get_name() != "c_box")
                    continue;

                c_widgets = child.get_children();
                if (!c_widgets) {
                    c_widget = this.content_box.c_manager.get_c_widget(this.exec_name);
                    if (c_widget != null) {
                        child.pack_start(c_widget, false, false, 2);
                        c_widget.show();
                    }
                } else {
                    for (let c_widget in c_widgets)
                        c_widget.show();
                }
                // Look for a stack recursively
                this.recursively_iterate(child);
            }
            this.isLoading = false;
            return true;
        }
        return false;
    },

    recursively_iterate: function(parent) {
        if (this.stack)
            return;
        for (let child in parent) {
            if (child instanceof Gtk.Stack) {
                this.stack = child;
                break;
            } else if (child instanceof Gtk.Container) {
                this.recursively_iterate(child);
            }
        }
    },

    request_navegation: function(id) {
        if(this.module && this.module.handler)
             this.module.handler.navegate(this, id);
    },
});

/*
const CCModule = new GObject.Class({
    Name: 'ClassicGnome.CCModule',
    GTypeName: 'ClassicGnomeCCModule',

    _init: function(label, mod_id, icon, category, keywords, content_box) {
        //label, icon, keywords, content_box, size=-1, is_c_mod=true, is_standalone=false, exec_name=mod_id, module=null
        this.sidePage = new SidePage(label, icon, keywords, content_box, -1, true, false, mod_id, null);
        this.name = mod_id;
        this.category = category;
    },

    process: function (c_manager) {
        if (c_manager.lookup_c_module(this.name)) {
            c_box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });
            c_box.set_vexpand(false);
            c_box.set_name("c_box");
            this.sidePage.add_widget(c_box);
            return true;
        }
        return false;
    },
});

const SAModule = new GObject.Class({
    Name: 'ClassicGnome.SAModule',
    GTypeName: 'ClassicGnomeSAModule',

   _init: function(label, mod_id, icon, category, keywords, content_box) {
        this.sidePage = new SidePage(label, icon, keywords, content_box, false, false, true, mod_id);
        this.name = mod_id;
        this.category = category;
    },

    process: function() {
        name = this.name.replace("gksudo ", "");
        name = name.replace("gksu ", "");
        name = name.split()[0];

        for (let path in os.environ["PATH"].split(os.pathsep)) {
            path = path.strip('"');
            exe_file = os.path.join(path, name);
            if (os.path.isfile(exe_file) && os.access(exe_file, os.X_OK))
                return true;
        }
        return false;
    },
});

function walk_directories(dirs, filter_func, return_directories) {//return_directories=false
    // If return_directories is false: returns a list of valid subdir names
    // Else: returns a list of valid tuples (subdir-names, parent-directory)
    valid = [];
    try {
        for (let thdir in dirs) {
            if (os.path.isdir(thdir)) {
                for (let t in os.listdir(thdir)) {
                    if (filter_func(os.path.join(thdir, t))) {
                        if (return_directories)
                            valid.push([t, thdir]);
                        else
                            valid.push(t);
                    }
                }
            }
        }
    } catch(e) {
        //global.logError("Error parsing directories");
    }
    return valid;
}

function rec_mkdir(path) {
    if (Gio.file_new_for_path(path).query_exists(null))
        return;

    rec_mkdir(os.path.split(path)[0]);

    if (Gio.file_new_for_path(path).query_exists(null))
        return;
    os.mkdir(path);
}
*/
const Section = new GObject.Class({
    Name: 'ClassicGnome.Section',
    GTypeName: 'ClassicGnomeSection',
    Extends: Gtk.Box,

    _init: function(name) {
        this.parent();
        this.name = name;
        this.set_orientation(Gtk.Orientation.VERTICAL);
        this.set_border_width(6);
        this.set_spacing(6);
        this.label = new Gtk.Label();
        this.label.set_markup("<b>%s</b>".format(this.name));
        hbox = new Gtk.Box();
        hbox.set_orientation(Gtk.Orientation.HORIZONTAL);
        hbox.pack_start(this.label, false, false, 0);
        this.pack_start(hbox, false, true, 0);
    },

    add: function(widget) {
        box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        box.set_margin_left(40);
        box.set_margin_right(40);
        box.pack_start(widget, false, true, 0);
        this.pack_start(box, false, false, 0);
    },

    add_expand: function(widget) {
        box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        box.set_margin_left(40);
        box.set_margin_right(40);
        box.pack_start(widget, true, true, 0);
        this.pack_start(box, false, false, 0);
    },

    add_indented: function(widget) {
        box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        box.set_margin_left(80);
        box.set_margin_right(10);
        box.pack_start(widget, false, true, 0);
        this.pack_start(box, false, false, 0);
    },

    add_indented_expand: function(widget) {
        box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        box.set_margin_left(80);
        box.set_margin_right(10);
        box.pack_start(widget, true, true, 0);
        this.pack_start(box, false, false, 0);
    },
});

const SectionBg = new GObject.Class({
    Name: 'ClassicGnome.SectionBg',
    GTypeName: 'ClassicGnomeSectionBg',
    Extends: Gtk.Viewport,

    _init: function() {
        this.parent();
        this.set_shadow_type(Gtk.ShadowType.ETCHED_IN);
        style = this.get_style_context();
        style.add_class("section-bg");
        this.expand = true; // Tells CS to give expand us to the whole window
    },
});

const SettingsStack = new GObject.Class({
    Name: 'ClassicGnome.SettingsStack',
    GTypeName: 'ClassicGnomeSettingsStack',
    Extends: Gtk.Stack,

    _init: function() {
        this.parent();
        this.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT);
        this.set_transition_duration(150);
        this.expand = true;
    },
});

const SettingsRevealer = new GObject.Class({
    Name: 'ClassicGnome.SettingsRevealer',
    GTypeName: 'ClassicGnomeSettingsRevealer',
    Extends: Gtk.Revealer,

    _init: function(schema, key, values) {//schema=null, key=null, values=null
        this.parent();

        this.box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 15 });
        Gtk.Revealer.prototype.add.call(this, this.box);

        this.set_transition_type(Gtk.RevealerTransitionType.SLIDE_DOWN);
        this.set_transition_duration(150);

        if (schema) {
            this.settings = global.getSettings(schema);
            // The value of this key is the information whether to show or to hide the revealer
            if (values == null) {
                this.settings.bind(key, this, "reveal-child", Gio.SettingsBindFlags.GET);
            } else {// only at some values of this key the reveaer must be shown
                this.values = values;
                this.settings.connect("changed::" + key, Lang.bind(this, this.on_settings_changed));
                this.on_settings_changed(this.settings, key);
           }
        }
    },

    add: function(widget) {
        this.box.pack_start(widget, false, true, 0);
    },

    // only used when checking values
    on_settings_changed: function(settings, key) {
        this.set_reveal_child(settings.get_value(key).unpack() in this.values);
    },
});

const SettingsPage = new GObject.Class({
    Name: 'ClassicGnome.SettingsPage',
    GTypeName: 'ClassicGnomeSettingsPage',
    Extends: Gtk.Box,

    _init: function() {
        this.parent();
        this.set_orientation(Gtk.Orientation.VERTICAL);
        this.set_spacing(15);
        this.set_margin_left(80);
        this.set_margin_right(80);
        this.set_margin_top(15);
        this.set_margin_bottom(15);
    },

    add_section: function(title) {
        let section = new SettingsBox(title);
        this.pack_start(section, false, false, 0);
        return section;
    },

    add_reveal_section: function(title, schema, key, values) {//title, schema=null, key=null, values=null
        let section = new SettingsBox(title);
        let revealer = new SettingsRevealer(schema, key, values);
        revealer.add(section);
        section._revealer = revealer;
        this.pack_start(revealer, false, false, 0);
        return section;
    },
});

const SettingsBox = new GObject.Class({
    Name: 'ClassicGnome.SettingsBox',
    GTypeName: 'ClassicGnomeSettingsBox',
    Extends: Gtk.Frame,

    _init: function(title) {
        this.parent();
        this.set_shadow_type(Gtk.ShadowType.IN);
        let frame_style = this.get_style_context();
        frame_style.add_class("view");
        this.size_group = new Gtk.SizeGroup();
        this.size_group.set_mode(Gtk.SizeGroupMode.VERTICAL);

        this.box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this.add(this.box);

        let toolbar = new Gtk.Toolbar;
        let toolbar_context = toolbar.get_style_context();
        //FIXME: How we can do that?
        //Gtk.StyleContext.add_class(Gtk.Widget.get_style_context(toolbar), "cs-header");

        let label = new Gtk.Label();
        label.set_markup("<b>%s</b>".format(title));
        let title_holder = new Gtk.ToolItem();
        title_holder.add(label);
        toolbar.add(title_holder);
        this.box.add(toolbar);

        let toolbar_separator = new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL });
        this.box.add(toolbar_separator);
        let separator_context = toolbar_separator.get_style_context();
        let frame_color = frame_style.get_border_color(Gtk.StateFlags.NORMAL).toString();
        let css_provider = new Gtk.CssProvider();

        //FIXME: How we can do that?
        //let css_data = ".separator { -GtkWidget-wide-separators: 0; \
        //                               color: %s;                   \
        //                           }".format(frame_color);
        //try {
        //    css_provider.load_from_data(css_data);
        //} catch(e) {
        //    // we must be using python 3
        //    css_provider.load_from_data(css_data);//str.encode(
        //}
        //separator_context.add_provider(css_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        
        this.need_separator = false;
    },

    add_row: function(widget) {
        let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        if (this.need_separator) {
            vbox.add(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }));
        }
        let list_box = new Gtk.ListBox();
        list_box.set_selection_mode(Gtk.SelectionMode.NONE);
        let row = new Gtk.ListBoxRow();
        row.add(widget);
        if (widget.name === 'ClassicGnome.Switch') { // instanceof didn't work here
            list_box.connect("row-activated", Lang.bind(widget, widget.clicked));
        }
        list_box.add(row);
        vbox.add(list_box);
        this.box.add(vbox);

        this.need_separator = true;
    },

    add_reveal_row: function(widget, schema, key, values) {//widget, schema=null, key=null, values=null
        let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        if (this.need_separator) {
            vbox.add(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }));
        }
        let list_box = new Gtk.ListBox();
        list_box.set_selection_mode(Gtk.SelectionMode.NONE);
        let row = new Gtk.ListBoxRow();
        row.add(widget);
        if (widget.name === 'ClassicGnome.Switch') { // instanceof didn't work here
            list_box.connect("row-activated", Lang.bind(widget, widget.clicked));
        }
        list_box.add(row);
        vbox.add(list_box);
        let revealer = new SettingsRevealer(schema, key, values);
        widget.revealer = revealer;
        revealer.add(vbox);
        this.box.add(revealer);

        this.need_separator = true;

        return revealer;
    },
});

const SettingsWidget = new GObject.Class({
    Name: 'ClassicGnome.SettingsWidget',
    GTypeName: 'ClassicGnomeSettingsWidget',
    Extends: Gtk.Box,

    _init: function(dep_key) { //dep_key=null
        this.parent();
        this.set_orientation(Gtk.Orientation.HORIZONTAL);
        this.set_spacing(20);
        this.set_border_width(5);
        this.set_margin_left(20);
        this.set_margin_right(20);

        if (dep_key) {
            this.set_dep_key(dep_key);
        }
    },

    set_dep_key: function(dep_key) {
        /*let flag = Gio.SettingsBindFlags.GET;
        if (dep_key[0] == "!") {
            dep_key = dep_key.substring(1, dep_key.length);
            flag |= Gio.Settings.BindFlags.INVERT_BOOLEAN;
        }
        let split = dep_key.split("/");
        dep_settings = global.getSettings(split[0]);
        dep_settings.bind(split[1], this, "sensitive", flag);*/
    },

    add_to_size_group: function(group) {
        group.add_widget(this.content_widget);
    },

    fill_row: function() {
        this.set_border_width(0);
        this.set_margin_left(0);
        this.set_margin_right(0);
    },

    get_settings: function(schema) {
        if(!(schema in settings_objects))
            settings_objects[schema] = global.getSettings(schema);
        return settings_objects[schema];
    },

    set_value: function(value) {
        // do nothing
    },

    get_value: function() {
       return null;
    },
});

const SettingsLabel = new GObject.Class({
    Name: 'ClassicGnome.SettingsLabel',
    GTypeName: 'ClassicGnomeSettingsLabel',
    Extends: Gtk.Label,

    _init: function(text) { //text=null
        this.parent();
        if (text) {
            this.set_label(text);
        }

        this.set_alignment(0.0, 0.5);
        this.set_line_wrap(true);
    },

    set_label_text: function(text) {
        this.set_label(text);
    },
});


const IndentedHBox = new GObject.Class({
    Name: 'ClassicGnome.IndentedHBox',
    GTypeName: 'ClassicGnomeIndentedHBox',
    Extends: Gtk.HBox,

    _init: function() {
        this.parent();
        indent = new Gtk.Label({ label: "\t" });
        this.pack_start(indent, false, false, 0);
    },

    add: function(item) {
        this.pack_start(item, false, true, 0);
    },

    add_expand: function(item) {
        this.pack_start(item, true, true, 0);
    },
});

const Switch = new GObject.Class({
    Name: 'ClassicGnome.Switch',
    GTypeName: 'ClassicGnomeSwitch',
    Extends: SettingsWidget,
    bind_prop: "active",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, { label: "", dep_key: null, tooltip: "" });
        this.parent(params.dep_key);
        this.content_widget = new Gtk.Switch();
        this.label = new SettingsLabel(params.label);
        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        this.content_widget.connect("state-set", Lang.bind(this, this.apply));
        // Set the initial state from settings.
        this.content_widget.set_active(this.state);
    },

    clicked: function(args) {
        this.content_widget.set_active(!this.content_widget.get_active());
    },

    apply: function(args) {
        this.set_value(this.content_widget.get_active());
    },
});

const SpinButton = new GObject.Class({
    Name: 'ClassicGnome.SpinButton',
    GTypeName: 'ClassicGnomeSpinButton',
    Extends: SettingsWidget,
    bind_prop: "value",
    bind_dir: Gio.SettingsBindFlags.GET,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", units: "", mini: null, maxi: null, step: 1,
            page: null, size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.timer = null;

        if (params.units) {
            params.label += " (%s)".format(params.units);
        }
        this.label = new SettingsLabel(params.label);
        this.content_widget = new Gtk.SpinButton();

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        let range = this.get_range();
        if ((params.mini == null) || (params.maxi == null)) {
            params.maxi = range[1];
            params.mini = range[0];
        } else if (range != null) {
            params.maxi = Math.min(params.maxi, range[1]);
            params.mini = Math.max(params.mini, range[0]);
        }

        if (!params.page) {
            params.page = params.step;
        }

        this.content_widget.set_range(params.mini, params.maxi);
        this.content_widget.set_increments(params.step, params.page);

        let digits = 0;
        if (params.step && (params.step.toString().indexOf('.') != -1)) {
            digits = params.step.toString().split('.')[1].length;
        }
        this.content_widget.set_digits(digits);

        this.content_widget.connect("value-changed", Lang.bind(this, this.apply_later));

        this.set_tooltip_text(params.tooltip);

        if (params.size_group) {
            this.add_to_size_group(params.size_group);
        }
        this.content_widget.set_value(this.state)
    },

    apply_later: function(args) {
        function applyValues() {
            this.set_value(this.content_widget.get_value());
            this.timer = null;
        }
        if (this.timer)
            GLib.source_remove(this.timer);
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, Lang.bind(this, applyValues));
    },
});

const Entry = new GObject.Class({
    Name: 'ClassicGnome.Entry',
    GTypeName: 'ClassicGnomeEntry',
    Extends: SettingsWidget,
    bind_prop: "text",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", expand_width: false, size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.label = new SettingsLabel(params.label);
        this.content_widget = new Gtk.Entry();
        this.content_widget.set_valign(Gtk.Align.CENTER);

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, params.expand_width, params.expand_width, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);

        //this.content_widget.set_text(this.state);

        this.content_widget.connect("changed", Lang.bind(this, this.applyValue));
    },

    applyValue: function(entry, edit) {
        this.set_value(this.content_widget.get_text());
    },
});

const TextView = new GObject.Class({
    Name: 'ClassicGnome.TextView',
    GTypeName: 'ClassicGnomeTextView',
    Extends: SettingsWidget,
    bind_prop: "text",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", height: 200, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.set_orientation(Gtk.Orientation.VERTICAL);
        this.set_spacing(8);

        this.label = new Gtk.Label({ label: params.label });
        this.label.set_halign(Gtk.Align.CENTER);

        this.scrolledwindow = new Gtk.ScrolledWindow({
            hadjustment: null,
            vadjustment: null,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        });
        this.scrolledwindow.set_size_request(-1, params.height);
        this.scrolledwindow.set_shadow_type(Gtk.ShadowType.ETCHED_IN);
        this.content_widget = new Gtk.TextView();
        this.content_widget.set_border_width(3);
        this.content_widget.set_wrap_mode(Gtk.WrapMode.NONE);
        this.bind_object = this.content_widget.get_buffer();

        this.pack_start(this.label, false, false, 0);
        this.add(this.scrolledwindow);
        this.scrolledwindow.add(this.content_widget);
        this._value_changed_timer = null;
    },
});

const FontButton = new GObject.Class({
    Name: 'ClassicGnome.FontButton',
    GTypeName: 'ClassicGnomeFontButton',
    Extends: SettingsWidget,
    bind_prop: "font-name",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.label = new SettingsLabel(params.label);

        this.content_widget = new Gtk.FontButton();
        this.content_widget.set_valign(Gtk.Align.CENTER);

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);
    },
});

const Range = new GObject.Class({
    Name: 'ClassicGnome.Range',
    GTypeName: 'ClassicGnomeRange',
    Extends: SettingsWidget,
    bind_prop: "font-name",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", min_label: "", max_label: "", mini: null, maxi: null,
            step: null, invert: false, log: false, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.set_orientation(Gtk.Orientation.VERTICAL);
        this.set_spacing(0);

        this.log = params.log;
        this.invert = params.invert;
        this.timer = null;
        this.value = 0;

        let hbox = new Gtk.Box();

        this.label = new Gtk.Label({ label: params.label });
        this.label.set_halign(Gtk.Align.CENTER);

        this.min_label= new Gtk.Label();
        this.max_label = new Gtk.Label();
        this.min_label.set_alignment(1.0, 0.75);
        this.max_label.set_alignment(1.0, 0.75);
        this.min_label.set_margin_right(6);
        this.max_label.set_margin_left(6);
        this.min_label.set_markup("<i><small>%s</small></i>".format(params.min_label));
        this.max_label.set_markup("<i><small>%s</small></i>".format(params.max_label));

        let range = this.get_range();
        if ((params.mini == null) || (params.maxi == null)) {
            params.mini = range[0];
            params.maxi = range[1];
        } else if (range != null) {
            params.mini = Math.max(params.mini, range[0]);
            params.maxi = Math.min(params.maxi, range[1]);
        }

        if (params.log) {
            params.mini = Math.log(params.mini);
            params.maxi = Math.log(params.maxi);
            this.map_get = function(x) { Math.log(x) };
            this.map_set = function(x) { Math.exp(x) };
        }

        if (params.step == null) {
            this.step = (params.maxi - params.mini) * 0.02;
        } else {
            this.step = params.log ? Math.log(params.step) : params.step;
        }

        this.content_widget = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, params.mini, params.maxi, this.step);
        this.content_widget.set_inverted(params.invert);
        this.content_widget.set_draw_value(false);
        this.bind_object = this.content_widget.get_adjustment();

        // Gtk.Scale.new_with_range want a positive value,
        // but our custom scroll handler wants a negative value
        if (params.invert)
            this.step *= -1; 

        hbox.pack_start(this.min_label, false, false, 0);
        hbox.pack_start(this.content_widget, true, true, 0);
        hbox.pack_start(this.max_label, false, false, 0);

        this.pack_start(this.label, false, false, 0);
        this.pack_start(hbox, true, true, 6);

        this.content_widget.connect("scroll-event", Lang.bind(this, this.on_scroll_event));
        this.content_widget.connect("value-changed", Lang.bind(this, this.apply_later));

        this.set_tooltip_text(params.tooltip);
    },

    apply_later: function(args) {
        function applyValues() {
            if (this.log)
                this.set_value(Math.exp(this.content_widget.get_value()));
            else
                this.set_value(this.content_widget.get_value());
            this.timer = null;
        }
        if (this.timer)
            GLib.source_remove(this.timer);
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, Lang.bind(this, applyValues));
    },

    on_scroll_event: function(widget, event) {
        let [found, delta_x, delta_y] = event.get_scroll_deltas();

        // If you scroll up, delta_y < 0. This is a weird world
        widget.set_value(widget.get_value() - delta_y * this.step);

        return true;
    },

    add_mark: function(value, position, markup) {
        if (this.log)
            this.content_widget.add_mark(Math.log(value), position, markup);
        else
            this.content_widget.add_mark(value, position, markup);
    },

    set_rounding: function(digits) {
        if (!this.log)
            this.content_widget.set_round_digits(digits);
    },
});

const ComboBox = new GObject.Class({
    Name: 'ClassicGnome.ComboBox',
    GTypeName: 'ClassicGnomeComboBox',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", options: [], valtype: "string", size_group: null,
            dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.valtype = params.valtype;
        this.option_map = {};

        this.label = new SettingsLabel(params.label);

        let selected = null;

        this.content_widget = new Gtk.ComboBox();
        let renderer_text = new Gtk.CellRendererText();
        this.content_widget.pack_start(renderer_text, true);
        this.content_widget.add_attribute(renderer_text, "text", 1);

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);
        this.content_widget.set_valign(Gtk.Align.CENTER);

        this.set_options(params.options);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);
    },

    on_my_value_changed: function(widget) {
        let [ok, tree_iter] = widget.get_active_iter();
        if (ok) {
            this.content_widget.set_active_iter(tree_iter);
            this.value = this.model.get_value(tree_iter, 0)
            this.set_value(this.value);
        }
    },

    on_setting_changed: function(args) {
        this.value = this.get_value();
        try {
            this.content_widget.set_active_iter(this.option_map[this.value]);
        } catch(e) {
            this.content_widget.set_active_iter(null);
        }
    },

    connect_widget_handlers: function(args) {
        this.content_widget.connect('changed', Lang.bind(this, this.on_my_value_changed));
    },

    set_options: function(options) {
        // assume all keys are the same type (mixing types is going to cause an error somewhere)
        this.model = Gtk.ListStore.new([GObject.TYPE_STRING, GObject.TYPE_STRING]);

        // Set the columns
        for (let i = 0; i < options.length; i++) {
            let option = options[i];
            let iter = this.model.append();
            this.option_map[option[0]] = iter;
            this.model.set(iter, [0, 1], [option[0].toString(), option[1].toString()]);
        }

        this.content_widget.set_model(this.model);
        this.content_widget.set_id_column(0);
    },
});

const ColorChooser = new GObject.Class({
    Name: 'ClassicGnome.ColorChooser',
    GTypeName: 'ClassicGnomeColorChooser',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", legacy_string: false, size_group: null, dep_key: null, tooltip: ""
        }); 
        this.parent(params.dep_key);
        // note: Gdk.Color is deprecated in favor of Gdk.RGBA, but as the hex format is still used
        // in some places (most notably the desktop background handling in cinnamon-desktop) we
        // still support it for now by adding the legacy_string argument
        this.legacy_string = params.legacy_string;

        this.label = new SettingsLabel(params.label);
        this.content_widget = new Gtk.ColorButton();
        this.content_widget.set_use_alpha(true);
        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);
    },

    on_setting_changed: function(args) {
        let color_string = this.get_value();
        if(!color_string || (color_string == undefined))
            color_string = "";
        let rgba = new Gdk.RGBA();
        rgba.parse(color_string);
        this.content_widget.set_rgba(rgba);
    },

    connect_widget_handlers: function(args) {
        this.content_widget.connect('color-set', Lang.bind(this, this.on_my_value_changed));
    },

    on_my_value_changed: function(widget) {
        let color_string = "";
        if (this.legacy_string) {
            color_string = this.content_widget.get_color().to_string();
        } else {
            color_string = this.content_widget.get_rgba().to_string();
        }
        this.set_value(color_string);
    },
});

const FileChooser = new GObject.Class({
    Name: 'ClassicGnome.FileChooser',
    GTypeName: 'ClassicGnomeFileChooser',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", dir_select: false, size_group: null, dep_key: null, tooltip: ""
        }); 
        this.parent(params.dep_key);

        if (params.dir_select)
            action = Gtk.FileChooserAction.SELECT_FOLDER;
        else
            action = Gtk.FileChooserAction.OPEN;

        this.label = new SettingsLabel(params.label);
        this.content_widget = new Gtk.FileChooserButton({ action: action });
        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);

        this.content_widget.set_uri(this.state);
    },

    on_file_selected: function(args) {
        this.set_value(this.content_widget.get_uri());
    },

    on_setting_changed: function(args) {
        this.content_widget.set_uri(this.get_value());
    },

    connect_widget_handlers: function(args) {
        this.content_widget.connect("file-set", Lang.bind(this, this.on_file_selected));
    },
});

const SoundFileChooser = new GObject.Class({
    Name: 'ClassicGnome.SoundFileChooser',
    GTypeName: 'ClassicGnomeSoundFileChooser',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.label = new SettingsLabel(params.label);
        this.content_widget = new Gtk.Box();

        let c = this.content_widget.get_style_context();
        c.add_class(Gtk.STYLE_CLASS_LINKED);

        this.file_picker_button = new Gtk.Button();
        this.file_picker_button.connect("clicked", Lang.bind(this, this.on_picker_clicked));

        let button_content = new Gtk.Box({ spacing: 5 });
        this.file_picker_button.add(button_content);

        this.button_label = new Gtk.Label();
        button_content.pack_start(new Gtk.Image({ icon_name: "sound" }), false, false, 0);
        button_content.pack_start(this.button_label, false, false, 0);

        this.content_widget.pack_start(this.file_picker_button, true, true, 0);

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.play_button = new Gtk.Button();
        this.play_button.set_image(new Gtk.Image ({
            icon_name: "media-playback-start-symbolic",
            icon_size: Gtk.IconSize.BUTTON 
        }));
        this.play_button.connect("clicked", Lang.bind(this, this.on_play_clicked));
        this.content_widget.pack_start(this.play_button, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group)
    },

    on_play_clicked: function(widget) {
        global.play_sound_file(0, this.get_value(), "", null);
    },

    on_picker_clicked: function(widget) {
        dialog = new Gtk.FileChooserDialog({
            title: this.label.get_text(),
            action: Gtk.FileChooserAction.OPEN,
            use_header_bar: true,
            select_multiple: false,
            transient_for: this.get_toplevel(),
        });
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        dialog.add_button(Gtk.STOCK_OPEN, Gtk.ResponseType.OK);

        dialog.set_filename(this.get_value());

        sound_filter = new Gtk.FileFilter();
        sound_filter.add_mime_type("audio/x-wav");
        sound_filter.add_mime_type("audio/x-vorbis+ogg");
        sound_filter.set_name(_("Sound files"));
        dialog.add_filter(sound_filter);

        if (dialog.run() == Gtk.ResponseType.ACCEPT) {
            name = dialog.get_filename();
            this.set_value(name);
            this.update_button_label(name);
        }

        dialog.destroy();
    },

    update_button_label: function(absolute_path) {
        if (absolute_path && (absolute_path !== undefined) && (absolute_path != "")) {
            f = Gio.File.new_for_path(absolute_path);
            this.button_label.set_label(f.get_basename());
        }
    },

    on_setting_changed: function(args) {
        this.update_button_label(this.get_value());
    },

    connect_widget_handlers: function(args) {
    },
});


const IconChooser = new GObject.Class({
    Name: 'ClassicGnome.IconChooser',
    GTypeName: 'ClassicGnomeIconChooser',
    Extends: SettingsWidget,
    bind_prop: "text",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", expand_width: false, size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        let [valid, width, height] = Gtk.icon_size_lookup(Gtk.IconSize.BUTTON);
        this.width = width;
        this.height = height;
        this.label = new SettingsLabel(params.label);

        this.content_widget = new Gtk.Box();
        this.bind_object = new Gtk.Entry();
        this.image_button = new Gtk.Button();

        this.preview = new Gtk.Image();
        this.image_button.set_image(this.preview);

        this.content_widget.pack_start(this.bind_object, params.expand_width, params.expand_width, 2);
        this.content_widget.pack_start(this.image_button, false, false, 5);

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, params.expand_width, params.expand_width, 0);

        this.image_button.connect("clicked", Lang.bind(this, this.on_button_pressed));
        this.handler = this.bind_object.connect("changed", Lang.bind(this, this.set_icon));

        this.set_tooltip_text(params.tooltip);

        if (params.size_group) {
            this.add_to_size_group(params.size_group);
        }

        this.set_icon(this.bind_object, this.state)
    },

    set_icon: function(entry, _val) {
        let val = _val ? _val : this.bind_object.get_text();
        this.bind_object.set_text(val)
        let fileInfo;

        try {
            fileInfo = Gio.file_new_for_path(val).query_info('standard::type', 0, null);
        } catch (e) {
            return false;
        }

        if (fileInfo.get_file_type() == Gio.FileType.REGULAR) {
            let img = GdkPixbuf.Pixbuf.new_from_file_at_size(val, this.width, this.height);
            this.preview.set_from_pixbuf(img);
        } else {
            this.preview.set_from_icon_name(val, Gtk.IconSize.BUTTON);
        }

        this.set_value(val);
        return true;
    },

    on_button_pressed: function(widget) {
        let dialog = new Gtk.FileChooserDialog({
            title: _("Choose an Icon"),
            action: Gtk.FileChooserAction.OPEN,
            use_header_bar: true,
            select_multiple: false,
            transient_for: this.get_toplevel(),
        });
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        dialog.add_button(Gtk.STOCK_OPEN, Gtk.ResponseType.OK);


        let filter_text = new Gtk.FileFilter();
        filter_text.set_name(_("Image files"));
        filter_text.add_mime_type("image/*");
        dialog.add_filter(filter_text);

        let preview = new Gtk.Image();
        dialog.set_preview_widget(preview);
        dialog.connect("update-preview", Lang.bind(this, this.update_icon_preview_cb, preview));

        let response = dialog.run();

        if (response == Gtk.ResponseType.OK) {
            let filename = dialog.get_filename();
            this.bind_object.set_text(filename);
            this.set_value(filename);
        }
        dialog.destroy();
    },

    update_icon_preview_cb: function(dialog, preview) {
        let filename = dialog.get_preview_filename();
        dialog.set_preview_widget_active(false);
        if (filename != null) {
            let fileInfo = Gio.file_new_for_path(filename).query_info('standard::type', 0, null);
            if (fileInfo.get_file_type() == Gio.FileType.REGULAR) {
                let pixbuf = GdkPixbuf.Pixbuf.new_from_file(filename);
                if (pixbuf != null) {
                    if (pixbuf.get_width() > 128) {
                        pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(filename, 128, -1);
                    } else if (pixbuf.get_height() > 128) {
                        pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(filename, -1, 128);
                    }
                    preview.set_from_pixbuf(pixbuf);
                    dialog.set_preview_widget_active(true);
                }
            }
        }
    },
});


const TweenChooser = new GObject.Class({
    Name: 'ClassicGnome.TweenChooser',
    GTypeName: 'ClassicGnomeTweenChooser',
    Extends: SettingsWidget,
    bind_prop: "tween",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", size_group: null, dep_key: null, tooltip:""
        });
        this.parent(params.dep_key);

        this.label = new SettingsLabel(params.label);

        this.content_widget = new ChooserButtonWidgets.TweenChooserButton();

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);
    },
});

const EffectChooser = new GObject.Class({
    Name: 'ClassicGnome.EffectChooser',
    GTypeName: 'ClassicGnomeEffectChooser',
    Extends: SettingsWidget,
    bind_prop: "effect",
    bind_dir: Gio.SettingsBindFlags.DEFAULT,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", possible: null, size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.label = new SettingsLabel(params.label);

        this.content_widget = new ChooserButtonWidgets.EffectChooserButton(params.possible);

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);
    },
});

const DateChooser = new GObject.Class({
    Name: 'ClassicGnome.DateChooser',
    GTypeName: 'ClassicGnomeDateChooser',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.label = new SettingsLabel(params.label);

        this.content_widget = new ChooserButtonWidgets.DateChooserButton();

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);
    },

    on_date_changed: function(args) {
        date = this.content_widget.get_date();
        this.set_value({"y": date[0], "m": date[1], "d": date[2]});
    },

    on_setting_changed: function(args) {
        date = this.get_value();
        this.content_widget.set_date(date["y"], date["m"], date["d"]);
    },

    connect_widget_handlers: function(args) {
        this.content_widget.connect("date-changed", Lang.bind(this, this.on_date_changed));
    },
});

const Keybinding = new GObject.Class({
    Name: 'ClassicGnome.Keybinding',
    GTypeName: 'ClassicGnomeKeybinding',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(params) {
        params = Params.parse(params, {
            label: "", num_bind: 2, size_group: null, dep_key: null, tooltip: ""
        });
        this.parent(params.dep_key);

        this.num_bind = params.num_bind;

        this.label = new SettingsLabel(params.label);

        this.buttons = [];
        this.teach_button = null;

        this.content_widget = new Gtk.Frame({ shadow_type: Gtk.ShadowType.IN });
        this.content_widget.set_valign(Gtk.Align.CENTER);
        let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.content_widget.add(box);

        this.pack_start(this.label, false, false, 0);
        this.pack_end(this.content_widget, false, false, 0);
        let kb;
        for (let x = 0; x < this.num_bind; x++) {
            if (x != 0)
                box.add(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));
            kb = new KeybindingWidgets.ButtonKeybinding();
            kb.set_size_request(150, -1);
            kb.connect("accel-edited", Lang.bind(this, this.on_kb_changed));
            kb.connect("accel-cleared", Lang.bind(this, this.on_kb_changed));
            box.pack_start(kb, false, false, 0);
            this.buttons.push(kb);
        }
        this.event_id = null;
        this.teaching = false;

        this.set_tooltip_text(params.tooltip);

        if (params.size_group)
            this.add_to_size_group(params.size_group);
    },

    on_kb_changed: function(args) {
        let bindings = [];
        for (let x = 0; x < this.num_bind; x++) {
            bindings.push(this.buttons[x].get_accel_string());
        }
        this.set_value(bindings.join("::"));
    },

    on_setting_changed: function(args) {
        let bindings = this.get_value().split("::");
        let mBindings = Math.min(bindings.length, this.num_bind);
        for (let x = 0; x < mBindings; x++) {
            this.buttons[x].set_accel_string(bindings[x]);
        }
    },

    connect_widget_handlers: function(args) {
    },
});


const Button = new GObject.Class({
    Name: 'ClassicGnome.Button',
    GTypeName: 'ClassicGnomeButton',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(label, callback) {
        //label, callback=null
        this.parent();

        this.label = label;
        this.callback = callback;

        this.content_widget = new Gtk.Button({ label: label });
        this.pack_start(this.content_widget, true, true, 0);
        this.content_widget.connect("clicked", Lang.bind(this, this._on_button_clicked));
    },

    _on_button_clicked: function(args) {
        if (this.callback != null)
            this.callback(this);
        else if (this.hasOwnProperty("on_activated"))
            this.on_activated();
        else
            global.log("warning: button '%s' does nothing".format(this.label));
    },

    set_label: function(label) {
        this.label = label;
        this.content_widget.set_label(label);
    },
});

const Text = new GObject.Class({
    Name: 'ClassicGnome.Text',
    GTypeName: 'ClassicGnomeText',
    Extends: SettingsWidget,
    bind_dir: null,

    _init: function(label, align) {//align=Gtk.Align.START
        //label, align=Gtk.Align.START
        this.parent();

        this.label = label;

        this.content_widget = new Gtk.Label({ label: label, halign:align });
        this.pack_start(this.content_widget, true, true, 0);
    },
});
