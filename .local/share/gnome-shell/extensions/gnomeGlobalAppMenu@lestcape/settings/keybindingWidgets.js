/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * keybindingWidgets.js - A library to provide a more widgets for the keybindig of Gnome Classic Settings -
 * ========================================================================================================
 */
const Lang = imports.lang;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Clutter = imports.gi.Clutter;

const _ = Gettext.gettext;

const FORBIDDEN_KEYVALS = [
    Gdk.KEY_Home,
    Gdk.KEY_Left,
    Gdk.KEY_Up,
    Gdk.KEY_Right,
    Gdk.KEY_Down,
    Gdk.KEY_Page_Up,
    Gdk.KEY_Page_Down,
    Gdk.KEY_End,
    Gdk.KEY_Tab,
    Gdk.KEY_KP_Enter,
    Gdk.KEY_Return,
    Gdk.KEY_space,
    Gdk.KEY_Mode_switch
];

//GObject.TYPE_INT
const ButtonKeybinding = new GObject.Class({
    Name: 'ClassicGnome.ButtonKeybinding',
    GTypeName: 'ClassicGnomeButtonKeybinding',
    Extends: Gtk.TreeView,
    Signals: {
        'accel-edited': {
            flags: GObject.SignalFlags.RUN_LAST, 
            param_types: [ GObject.TYPE_STRING, GObject.TYPE_STRING ]
        },
        'accel-cleared': {
            flags: GObject.SignalFlags.RUN_LAST, 
            param_types: []
        },
    },
    Properties: {
        "accel-string": GObject.ParamSpec.string(
            "accel-string", "accelerator string",
            "Parseable accelerator string",
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            "foobar"
        ),
    },

    _init: function() {
        this.parent();

        this.set_headers_visible(false);
        this.set_enable_search(false);
        this.set_hover_selection(true);
        this.accel_string = "";
        this.keybinding_cell = new CellRendererKeybinding(this, null);
        this.keybinding_cell.set_alignment(.5,.5);
        this.keybinding_cell.connect('accel-edited', Lang.bind(this, this.on_cell_edited));
        this.keybinding_cell.connect('accel-cleared', Lang.bind(this, this.on_cell_cleared));

        let col = new Gtk.TreeViewColumn({ title: "binding" });//accel_string=0
        col.pack_start (this.keybinding_cell, true);
        col.add_attribute (this.keybinding_cell, "text", 0);
        col.set_alignment(.5);

        this.entry_store = new Gtk.ListStore(); // Accel string
        this.entry_store.set_column_types([GObject.TYPE_STRING]);
        this.set_model(this.entry_store);
        this.append_column(col);
        this.load_model();
        this.keybinding_cell.set_property('editable', true);
        this.connect("focus-out-event", Lang.bind(this, this.on_focus_lost));
    },

    on_cell_edited: function(cell, path, accel_string, accel_label) {
        this.accel_string = accel_string;
        this.emit("accel-edited", accel_string, accel_label);
        this.load_model();
    },

    on_cell_cleared: function(cell, path) {
        this.accel_string = "";
        this.emit("accel-cleared");
        this.load_model();
    },

    on_focus_lost: function(widget, event) {
        this.get_selection().unselect_all();
    },

    load_model: function() {
        this.entry_store.clear();
        let iter = this.entry_store.append();
        this.entry_store.set(iter, [0], [this.accel_string]);
    },

    do_get_property: function(prop) {
        if (prop.name == 'accel-string')
            return this.accel_string;
        throw new Exception("unknown property %s".format(prop.name));
    },

    do_set_property: function(prop, value) {
        if (prop.name == 'accel-string') {
            if (value != this.accel_string) {
                this.accel_string = value;
                this.keybinding_cell.set_value(value);
            }
            throw new Exception("unknown property %s".format(prop.name));
        }
    },

    get_accel_string: function() {
        return this.accel_string;
    },

    set_accel_string: function(accel_string) {
        this.accel_string = accel_string;
        this.load_model();
    },
});

const CellRendererKeybinding = new GObject.Class({
    Name: 'ClassicGnome.CellRendererKeybinding',
    GTypeName: 'ClassicGnomeCellRendererKeybinding',
    Extends: Gtk.CellRendererText,
    Signals: {
        'accel-edited': {
            flags: GObject.SignalFlags.RUN_LAST,
            param_types: [ GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_STRING ]
        },
        'accel-cleared': {
            flags: GObject.SignalFlags.RUN_LAST,
            param_types: [ GObject.TYPE_STRING ]
        },
    },
    Properties: {
        "accel-string": GObject.ParamSpec.string(
            "accel-string", "accelerator string",
            "Parseable accelerator string",
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            "foobar"
        ),
    },

    _init: function(a_widget, accel_string) {
        this.parent();

        this.connect("editing-started", Lang.bind(this, this.editing_started));
        this.release_event_id = 0;
        this.press_event_id = 0;
        this.focus_id = 0;
        this.a_widget = a_widget;
        this.accel_string = accel_string;

        this.path = null;
        this.press_event = null;
        this.teaching = false;

        this.update_label();
    },

    do_get_property: function(prop) {
        if (prop.name == 'accel-string')
            return this.accel_string;
        throw new Exception("unknown property %s".format(prop.name));
    },

    do_set_property: function(prop, value) {
        if (prop.name == 'accel-string') {
            if (value != this.accel_string) {
                this.accel_string = value;
                this.update_label();
            }
        }
        throw new Exception("unknown property %s".format(prop.name));
    },

    update_label: function() {
        let text;
        if (!this.accel_string || (this.accel_string === "") || (this.accel_string === undefined)) {
            text = _("unassigned");
        } else {
            let [key, codes, mods] = Gtk.accelerator_parse_with_keycode(this.accel_string);
            text = Gtk.accelerator_get_label_with_keycode(null, key, codes[0], mods);
        }
        this.set_property("text", text);
    },

    set_value: function(accel_string) {//accel_string=null
        if(!accel_string || (accel_string === undefined))
            accel_string = "";
        this.set_property("accel-string", accel_string);
    },

    editing_started: function(renderer, editable, path) {
        if (!this.teaching) {
            this.path = path;
            let device = Gtk.get_current_event_device();
            if (device.get_source() == Gdk.InputSource.KEYBOARD)
                this.keyboard = device;
            else
                this.keyboard = device.get_associated_device();

            this.keyboard.grab(this.a_widget.get_window(), Gdk.GrabOwnership.WINDOW, false,
                               Gdk.EventMask.KEY_PRESS_MASK | Gdk.EventMask.KEY_RELEASE_MASK,
                               null, Gdk.CURRENT_TIME);

            editable.set_text(_("Pick an accelerator"));
            this.accel_editable = editable;

            this.release_event_id = this.accel_editable.connect("key-release-event", Lang.bind(this, this.on_key_release));
            this.press_event_id = this.accel_editable.connect("key-press-event", Lang.bind(this, this.on_key_press));
            this.focus_id = this.accel_editable.connect("focus-out-event", Lang.bind(this, this.on_focus_out));
            this.teaching = true;
        } else {
            this.ungrab();
            this.update_label();
            this.teaching = false;
        }
    },

    on_focus_out: function(widget, event) {
        this.ungrab();
    },

    on_key_press: function(widget, event) {
        if (this.teaching) {
            this.press_event = event.copy();
            return true;
        }
        return false;
    },

    on_key_release: function(widget, event) {
        this.ungrab();
        this.teaching = false;
        event = this.press_event;

        let display = widget.get_display();
        let keymap = Gdk.Keymap.get_for_display(display);
        let [, keyval] = event.get_keyval();
        let [, accel_mods] = event.get_state();

        let group = event.group;
        //gnome-shell-extension-prefs gnomeGlobalAppMenu@lestcape
        //FIXME: Aparently gnome shell send a GdK.Event instead of a GDK.EventKey
        group = (!group || (group === undefined)) ? 0 : group;
        /*if(group === undefined) {
            group = 0;
            //FIXME: Now this not work, on GS 3.18.5.
            let [ok, keys] = keymap.get_entries_for_keyval(keyval);
            if(ok && keys.length > 0) {
                group = keys[0].group;
            }
        }*/
        // HACK: we don't want to use SysRq as a keybinding (but we do
        // want Alt+Print), so we avoid translation from Alt+Print to SysRq
        let consumed_modifiers;
        if ((keyval == Gdk.KEY_Sys_Req) &&
           ((accel_mods & Gdk.ModifierType.MOD1_MASK) != 0)) {
            keyval = Gdk.KEY_Print;
            consumed_modifiers = 0;
        } else {
            let group_mask_disabled = false;
            let shift_group_mask = 0;

            shift_group_mask = keymap.get_modifier_mask(Gdk.ModifierIntent.SHIFT_GROUP);

            if (Gtk.accelerator_get_default_mod_mask() & accel_mods & shift_group_mask) {
                accel_mods &= ~shift_group_mask;
                group = 0;
                group_mask_disabled = true;
            }
            let [retval, keyval, effective_group, level, consumed_modifiers] = 
                   keymap.translate_keyboard_state(event.hardware_keycode, accel_mods, group);

            if (group_mask_disabled)
                effective_group = 1;

            if (consumed_modifiers)
                consumed_modifiers &= ~shift_group_mask;
        }

        let accel_key = Gdk.keyval_to_lower(keyval);
        if (accel_key == Gdk.KEY_ISO_Left_Tab)
            accel_key = Gdk.KEY_Tab;

        accel_mods &= Gtk.accelerator_get_default_mod_mask();

        accel_mods &= ~consumed_modifiers;

        if (accel_key != keyval)
            accel_mods |= Gdk.ModifierType.SHIFT_MASK;

        if (accel_mods == 0) {
            if (accel_key == Gdk.KEY_Escape) {
                this.update_label();
                this.teaching = false;
                this.path = null;
                this.press_event = null;
                return true;
            } else if (accel_key == Gdk.KEY_BackSpace) {
                this.teaching = false;
                this.press_event = null;
                this.set_value(null);
                this.emit("accel-cleared", this.path);
                this.path = null;
                return true;
            }
        }
        let accel_string = Gtk.accelerator_name_with_keycode(null, accel_key, event.hardware_keycode, accel_mods);
        let accel_label = Gtk.accelerator_get_label_with_keycode(null, accel_key, event.hardware_keycode, accel_mods);

        if (((accel_mods == 0) || (accel_mods == Gdk.ModifierType.SHIFT_MASK)) && (event.hardware_keycode != 0)) {
            if (((keyval >= Gdk.KEY_a)                    && (keyval <= Gdk.KEY_z)) ||
                ((keyval >= Gdk.KEY_A)                    && (keyval <= Gdk.KEY_Z)) ||
                ((keyval >= Gdk.KEY_0)                    && (keyval <= Gdk.KEY_9)) ||
                ((keyval >= Gdk.KEY_kana_fullstop)        && (keyval <= Gdk.KEY_semivoicedsound)) ||
                ((keyval >= Gdk.KEY_Arabic_comma)         && (keyval <= Gdk.KEY_Arabic_sukun)) ||
                ((keyval >= Gdk.KEY_Serbian_dje)          && (keyval <= Gdk.KEY_Cyrillic_HARDSIGN)) ||
                ((keyval >= Gdk.KEY_Greek_ALPHAaccent)    && (keyval <= Gdk.KEY_Greek_omega)) ||
                ((keyval >= Gdk.KEY_hebrew_doublelowline) && (keyval <= Gdk.KEY_hebrew_taf)) ||
                ((keyval >= Gdk.KEY_Thai_kokai)           && (keyval <= Gdk.KEY_Thai_lekkao)) ||
                ((keyval >= Gdk.KEY_Hangul)               && (keyval <= Gdk.KEY_Hangul_Special)) ||
                ((keyval >= Gdk.KEY_Hangul_Kiyeog)        && (keyval <= Gdk.KEY_Hangul_J_YeorinHieuh)) ||
                (keyval in FORBIDDEN_KEYVALS)) {
                let dialog = new Gtk.MessageDialog({
                    buttons: [Gtk.ButtonsType.OK],
                    message_type: Gtk.MessageType.ERROR,
                    transient_for: this.a_widget.get_toplevel(),
                });
                dialog.set_default_size(400, 200);
                let msg = "\n" + _("This key combination, \'<b>%s</b>\' cannot be used because it would become impossible to type using this key.") + "\n\n";
                msg += _("Please try again with a modifier key such as Control, Alt or Super (Windows key) at the same time.") + "\n";
                dialog.set_markup(msg.format(accel_label));
                dialog.show_all();
                let response = dialog.run();
                dialog.destroy();
                return true;
            }
        }
        this.press_event = null;
        this.set_value(accel_string);
        this.emit("accel-edited", this.path, accel_string, accel_label);
        this.path = null;

        return true;
    },

    ungrab: function() {
        this.keyboard.ungrab(Gdk.CURRENT_TIME);
        if (this.release_event_id > 0) {
            this.accel_editable.disconnect(this.release_event_id);
            this.release_event_id = 0;
        }
        if (this.press_event_id > 0) {
            this.accel_editable.disconnect(this.press_event_id);
            this.press_event_id = 0;
        }
        if (this.focus_id > 0) {
            this.accel_editable.disconnect(this.focus_id);
            this.focus_id = 0;
        }
        try {
            this.accel_editable.editing_done();
            this.accel_editable.remove_widget();
        } catch(e) {
        }
    },
});
