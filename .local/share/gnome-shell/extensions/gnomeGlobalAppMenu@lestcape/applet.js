const Lang = imports.lang;
const Signals = imports.signals;
const Gettext = imports.gettext;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;
const Util = imports.misc.util;
const ModalDialog = imports.ui.modalDialog;
const DND = imports.ui.dnd;

const ExtensionSystem = imports.ui.extensionSystem;
const MyExtension = imports.misc.extensionUtils.getCurrentExtension();
const ConfigurableMenus = MyExtension.imports.configurableMenus;


const COLOR_ICON_HEIGHT_FACTOR = .875;  // Panel height factor for normal color icons
const PANEL_FONT_DEFAULT_HEIGHT = 11.5; // px
const PANEL_SYMBOLIC_ICON_DEFAULT_HEIGHT = 1.14 * PANEL_FONT_DEFAULT_HEIGHT; // ems conversion
const DEFAULT_PANEL_HEIGHT = 25;
const DEFAULT_ICON_HEIGHT = 22;
const FALLBACK_ICON_HEIGHT = 22;

const AllowedLayout = {  // the panel layout that an applet is suitable for
    VERTICAL: 'vertical',
    HORIZONTAL: 'horizontal',
    BOTH: 'both'
};

const MOD_MASK =[
    Clutter.KEY_Alt_L, Clutter.KEY_Alt_R, Clutter.KEY_Control_L,
    Clutter.KEY_Control_R, Clutter.KEY_Shift_L, Clutter.KEY_Shift_R
];

function KeybindingManager() {
    this._init();
}

KeybindingManager.prototype = {
    _init: function() {
        this.bindings = {};
        this._custom_keybindings = {};
        this.actionGrab = null;
        this.keyGrab = null;
        this.grabFocus = null;
        this.focusWindow = null;
        this.inihibit = false;

        this.hackId = global.stage.connect('captured-event', Lang.bind(this, this._stageEventHandler));
        this.updateId = Main.sessionMode.connect('updated', Lang.bind(this, this._sessionUpdated)); 

        this._accelId = global.display.connect('accelerator-activated', Lang.bind(this, this._acceleratorActivated)); 
        this._modAccelId = global.display.connect('modifiers-accelerator-activated', Lang.bind(this, this._modifiersAceleratorActivated));
    },

    _acceleratorActivated: function(display, actionPreformed, deviceid, timestamp) {
        if (actionPreformed && !this.inihibit) {
            let extName = Meta.external_binding_name_for_action(actionPreformed);
            if(extName.indexOf("external-grab") != -1) {
                //global.log("was " + extName);
                for (let name in this._custom_keybindings) {
                    let keyBinds = this._custom_keybindings[name];
                    for (let pos in keyBinds) {
                        if(keyBinds[pos]["action"] == actionPreformed) {
                            let handler = keyBinds[pos]["handler"];
                            let kb = null; //FIXME: What it's this a keyboard map, the active keyboard state?
                            let event = Clutter.get_current_event(); // This is the current keyboard event-
                            handler(display, global.screen, event, kb, actionPreformed);
                        }
                    }
                }
            }
        }
    },

    _modifiersAceleratorActivated: function(display) {
        global.log("Accel active: modifiers-accelerator-activated");
    },

    _add_custom_keybinding: function(name, bindings, handler) {
        this._custom_keybindings[name] = [];
        let modes = Shell.ActionMode.ALL;
        for (let pos in bindings) {
            let action = global.display.grab_accelerator(bindings[pos]);
            this._custom_keybindings[name].push({ "action": action, "handler": handler });
            if (action != Meta.KeyBindingAction.NONE) {
                Main.wm.allowKeybinding(Meta.external_binding_name_for_action(action), modes);
            }
        }
        return true;
    },

    _remove_custom_keybinding: function(name) {
        if(this._custom_keybindings && (name in this._custom_keybindings)) {
            let keyBinds = this._custom_keybindings[name];
            for(let pos in keyBinds) {
                if(keyBinds[pos]["action"] != Meta.KeyBindingAction.NONE) {
                    global.display.ungrab_accelerator(keyBinds[pos]["action"]);
                }
            }
            delete this._custom_keybindings[name];
        }
    },

    _rebuild_keybindings: function() {
        //let ungrabSucceeded = global.display.ungrab_accelerator(action);
    },

    _stageEventHandler: function(actor, event) {
        let keyCode, modifierState, action;
        if (event.type() == Clutter.EventType.KEY_PRESS) {
            keyCode = event.get_key_code();
            modifierState = event.get_state();
            this.keyGrab = event.get_key_symbol();
            if(MOD_MASK.indexOf(event.get_key_symbol()) == -1) {
                action = global.display.get_keybinding_action(keyCode, modifierState);
                if (action && Meta.external_binding_name_for_action(action).indexOf("external-grab") != -1) {
                    global.display.emit("accelerator-activated", action, null, global.get_current_time());
                }
            } else {
                action = global.display.get_keybinding_action(keyCode, modifierState);
                this.actionGrab = action;
                this.grabFocus = global.stage.key_focus;
            }
        } else if (event.type() == Clutter.EventType.KEY_RELEASE) {
            let execute = false;
            if((global.stage.key_focus == this.grabFocus) && (MOD_MASK.indexOf(this.keyGrab) > -1) && (this.keyGrab == event.get_key_symbol())) {
                keyCode = event.get_key_code();
                modifierState = event.get_state();
                action = global.display.get_keybinding_action(keyCode, modifierState);
                if (this.actionGrab && Meta.external_binding_name_for_action(this.actionGrab).indexOf("external-grab") != -1) {
                    let action = this.actionGrab;
                    this.actionGrab = null;
                    if(this.grabFocus == Main.uiGroup)
                        global.stage.set_key_focus(null);
                    global.display.emit("accelerator-activated", action, null, global.get_current_time());
                    execute = true;
                }
            }
            if(!execute && this.focusWindow && (!global.stage.key_focus || (global.stage.key_focus == Main.uiGroup))) {
                this.focusWindow.activate(global.get_current_time());
            }
            this.grabFocus = null;
            this.keyGrab = null;
        }
    },

    _sessionUpdated: function() {
        let sensitive = !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter;
        if(sensitive) {
            for (let name in this.bindings) {
                this.addHotKeyArray(name, this.bindings[name].bindings, this.bindings[name].callback);
            }
            this.hackId = global.stage.connect('captured-event', Lang.bind(this, this._stageEventHandler));
        }
    },

    addHotKey: function(name, bindings_string, callback) {
        if (!bindings_string)
            return false;
        return this.addHotKeyArray(name, bindings_string.split("::"), callback);
    },

    addHotKeyArray: function(name, bindings, callback) {
        if (name in this.bindings) {
            if (this.bindings[name].bindings.toString() == bindings.toString()) {
              return true;
            }
            this._remove_custom_keybinding(name);
        }

        if (!bindings) {
            global.logError("Missing bindings array for keybinding: " + name);
            return false;
        }

        let empty = true;
        for (let i = 0; empty && (i < bindings.length); i++) {
            empty = bindings[i].toString().trim() == "";
        }

        if (empty) {
            if (name in this.bindings)
                delete this.bindings[name];
            this._rebuild_keybindings();
            return true;
        }
        //name
        if (!this._add_custom_keybinding(name, bindings, Lang.bind(this, this._filter, callback))) {
            global.logError("Warning, unable to bind hotkey with name '" + name + "'.  The selected keybinding could already be in use.");
            this._rebuild_keybindings();
            return false;
        } else {
            this.bindings[name] = { "bindings": bindings, "callback": callback };
        }
        this._rebuild_keybindings();
        return true;
    },

    _filter: function(display, screen, event, kb, actionPreformed, callback) {
        if(event) {
            this.keyGrab = event.get_key_symbol();
            if(MOD_MASK.indexOf(event.get_key_symbol()) == -1) {
                callback(display, global.screen, event, kb, actionPreformed);
            } else if (event.type() == Clutter.EventType.KEY_RELEASE) {
                callback(display, global.screen, event, kb, actionPreformed);
            } else {
                if (event.type() == Clutter.EventType.KEY_PRESS) {
                    this.grabFocus = global.stage.key_focus;
                    this.focusWindow = global.display.focus_window;
                    if(!this.grabFocus) {
                        this.grabFocus = Main.uiGroup;
                        global.stage.set_key_focus(this.grabFocus);
                    }
                    this.actionGrab = actionPreformed;
                }
            }
        }
    },

    removeHotKey: function(name) {
        if (name in this.bindings) {
            //FIXME: This next line won't work on unloock screen.
            this._remove_custom_keybinding(name);
            this._rebuild_keybindings();
            delete this.bindings[name];
        }
    },

    key_is_modifier: function(keyval) {
      switch (keyval) {
         case Gdk.KEY_Shift_L:
         case Gdk.KEY_Shift_R:
         case Gdk.KEY_Control_L:
         case Gdk.KEY_Control_R:
         case Gdk.KEY_Caps_Lock:
         case Gdk.KEY_Shift_Lock:
         case Gdk.KEY_Meta_L:
         case Gdk.KEY_Meta_R:
         case Gdk.KEY_Alt_L:
         case Gdk.KEY_Alt_R:
         case Gdk.KEY_Super_L:
         case Gdk.KEY_Super_R:
         case Gdk.KEY_Hyper_L:
         case Gdk.KEY_Hyper_R:
         case Gdk.KEY_ISO_Lock:
         case Gdk.KEY_ISO_Level2_Latch:
         case Gdk.KEY_ISO_Level3_Shift:
         case Gdk.KEY_ISO_Level3_Latch:
         case Gdk.KEY_ISO_Level3_Lock:
         case Gdk.KEY_ISO_Level5_Shift:
         case Gdk.KEY_ISO_Level5_Latch:
         case Gdk.KEY_ISO_Level5_Lock:
         case Gdk.KEY_ISO_Group_Shift:
         case Gdk.KEY_ISO_Group_Latch:
         case Gdk.KEY_ISO_Group_Lock:
           return true;
         default:
           return false;
      }
      return  false;
   },

    destroy: function() {
        if(this.updateId) {
            Main.sessionMode.disconnect(this.updateId);
            this.updateId = null;
        }
        if(this.hackId) {
            global.stage.disconnect(this.hackId);
            this.hackId = null;
        }
        if(this._accelId) {
            global.stage.disconnect(this._accelId);
            this._accelId = null;
        }
        if(this._modAccelId) {
            global.stage.disconnect(this._modAccelId);
            this._modAccelId = null;
        }
        for (let name in this.bindings) {
            this.removeHotKey(name);
        }
    },
};

/**
 * #SpicesAboutDialog:
 * @short_description: A dialog for a spice "about" window
 *
 * This is a window that displays an about dialog for Cinnamon "spices".
 *
 * This is usually used by Cinnamon itself via an "About" right click menu, but
 * individual spices can also use this to open an about dialog if they wish.
 */
function SpicesAboutDialog(metadata, type) {
    this._init(metadata, type);
}

SpicesAboutDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    /**
     * _init:
     * metadata (JSON): the metadata object of the spice
     * type (string): the type of the spice, which should be "applet",
     * "desklet" or "extension"
     */
    _init: function(metadata, type) {
        ModalDialog.ModalDialog.prototype._init.call(this);

        //prepare translation
        this.uuid = metadata.uuid;
        Gettext.bindtextdomain(metadata.uuid, GLib.get_home_dir() + "/.local/share/locale");

        let contentBox = new St.BoxLayout({vertical: true, style_class: "about-content" });
        this.contentLayout.add_actor(contentBox);
        
        let topBox = new St.BoxLayout();
        contentBox.add_actor(topBox);
        
        //icon
        let icon;
        if (metadata.icon) {
            icon = new St.Icon({icon_name: metadata.icon, icon_size: 48, style_class: "about-icon"});
        } else {
            let file = Gio.file_new_for_path(MyExtension.path).get_child("icon.png");
            if (file.query_exists(null)) {
                let gicon = new Gio.FileIcon({file: file});
                icon = new St.Icon({gicon: gicon, icon_size: 48, style_class: "about-icon"});
            } else {
                icon = new St.Icon({icon_name: "cs-"+type, icon_size: 48, style_class: "about-icon"});
            }
        }
        topBox.add_actor(icon);
        
        let topTextBox = new St.BoxLayout({vertical: true});
        topBox.add_actor(topTextBox);
        
        /*title*/
        let titleBox = new St.BoxLayout();
        topTextBox.add_actor(titleBox);

        let title = new St.Label({text: this._(metadata.name), style_class: "about-title"});
        titleBox.add_actor(title);
        
        if (metadata.version) {
            let versionBin = new St.Bin({x_align: St.Align.START, y_align: St.Align.END});
            titleBox.add_actor(versionBin);
            let version = new St.Label({text: " v%s".format(metadata.version), style_class: "about-version"});
            versionBin.add_actor(version);
        }
        
        //uuid
        let uuid = new St.Label({text: metadata.uuid, style_class: "about-uuid"});
        topTextBox.add_actor(uuid);
        
        //description
        let desc = new St.Label({text: this._(metadata.description), style_class: "about-description"});
        let dText = desc.clutter_text;
        dText.ellipsize = Pango.EllipsizeMode.NONE;
        dText.line_wrap = true;
        dText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        topTextBox.add_actor(desc);

        // optional content
        if(metadata.comments || metadata.website || metadata.contributors){
            let scrollBox = new St.ScrollView({style_class: "about-scrollBox"});
            contentBox.add(scrollBox, {expand: true});
            let infoBox = new St.BoxLayout({vertical: true, style_class: "about-scrollBox-innerBox"});
            scrollBox.add_actor(infoBox);

            // comments
            if (metadata.comments) {
                let comments = new St.Label({text: _("Comments:") + "\n\t" + this._(metadata.comments)});
                let cText = comments.clutter_text;
                cText.ellipsize = Pango.EllipsizeMode.NONE;
                cText.line_wrap = true;
                cText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
                infoBox.add_actor(comments);
            }

            // website
            if (metadata.website) {
                let wsBox = new St.BoxLayout({vertical: true});
                infoBox.add_actor(wsBox);

                let wLabel = new St.Label({text: _("Website:")});
                wsBox.add_actor(wLabel);

                let wsButton = new St.Button({x_align: St.Align.START, style_class: "cinnamon-link", name: "about-website"});
                wsBox.add_actor(wsButton);
                let website = new St.Label({text: metadata.website});
                let wtext = website.clutter_text;
                wtext.ellipsize = Pango.EllipsizeMode.NONE;
                wtext.line_wrap = true;
                wtext.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
                wsButton.add_actor(website);
                wsButton.connect("clicked", Lang.bind(this, this._launchSite, metadata.website));
            }

            // contributors
            if (metadata.contributors) {
                let list = metadata.contributors;

                // enforce that the list is an array
                if(typeof list === "string")
                    list = list.split(",");

                // trim whitespaces, try to translate each item and glue all together
                list = list.map(String.trim).map(this._, this).join("\n\t");

                let contributors = new St.Label({text: _("Contributors:") + "\n\t" + list});
                infoBox.add_actor(contributors);
            }
        }
        
        //dialog close button
        this.setButtons([
            {label: _("Close"), key: "", focus: true, action: Lang.bind(this, this._onOk)}
        ]);
        
        this.open(global.get_current_time());
    },

    // translation
    _: function(str) {
        // look into the text domain first
        let translated = Gettext.dgettext(this.uuid, str);

        // if it looks translated, return the translation of the domain
        if(translated !== str)
            return translated;
        // else, use the default cinnamon domain
        return _(str);
    },

    _onOk: function() {
        this.close(global.get_current_time());
    },
    
    _launchSite: function(a, b, site) {
        Util.spawnCommandLine("xdg-open " + site);
        this.close(global.get_current_time());
    }
}

/**
 * #AppletContextMenu
 * @short_description: Applet right-click menu
 *
 * A context menu (right-click menu) to be used by an applet
 *
 * Inherits: PopupMenu.PopupMenu
 */
function AppletContextMenu(launcher, orientation) {
    this._init(launcher, orientation);
}

AppletContextMenu.prototype = {
    __proto__: ConfigurableMenus.ConfigurableMenu.prototype,

    /**
     * _init:
     * @launcher (Applet.Applet): The applet that contains the context menu
     * @orientation (St.Side): The orientation of the applet
     *
     * Constructor function
     */
    _init: function(launcher, orientation) {
        ConfigurableMenus.ConfigurableMenu.prototype._init.call(this, launcher, 0.0, orientation, true);
        this.launcher = launcher;
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
        this.connect("open-state-changed", Lang.bind(this, this._onOpenStateChanged, this.launcher.actor));
        this._orientationId = this.launcher.connect("orientation-changed", Lang.bind(this, function(a, orientation) {
            this.setArrowSide(orientation);
        }));
    },

    _onOpenStateChanged: function(menu, open, sourceActor) {
        if(open)
           sourceActor.add_style_pseudo_class("checked");
        else
           sourceActor.remove_style_pseudo_class("checked");
    },

    destroy: function() {
        if(this._orientationId) {
            this.launcher.disconnect(this._orientationId);
            this._orientationId = null;
        }
        ConfigurableMenus.ConfigurableMenu.prototype.destroy.call(this);
    }
};

/**
 * #AppletPopupMenu:
 * @short_description: Applet left-click menu
 *
 * A popupmenu menu (left-click menu) to be used by an applet
 *
 * Inherits: PopupMenu.PopupMenu
 */
function AppletPopupMenu(launcher, orientation) {
    this._init(launcher, orientation);
}

AppletPopupMenu.prototype = {
    __proto__: ConfigurableMenus.ConfigurableMenu.prototype,

    /**
     * _init:
     * @launcher (Applet.Applet): The applet that contains the context menu
     * @orientation (St.Side): The orientation of the applet
     *
     * Constructor function
     */
    _init: function(launcher, orientation) {
        ConfigurableMenus.ConfigurableMenu.prototype._init.call(this, launcher, 0.0, orientation, true);
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
        this.launcher = launcher;
        if (this.launcher instanceof Applet) {
            this.connect("open-state-changed", Lang.bind(this, this._onOpenStateChanged, this.launcher));
            this._orientationId = this.launcher.connect("orientation-changed", Lang.bind(this, this._onOrientationChanged));
        } else if (this.launcher._applet) {
            this._orientationId = this.launcher._applet.connect("orientation-changed", Lang.bind(this, this._onOrientationChanged));
        }
    },

    _onOrientationChanged: function(a, orientation) {
        this.setArrowSide(orientation);
    },

    _onOpenStateChanged: function(menu, open, sourceActor) {
        if (!sourceActor._applet_context_menu.isOpen)
            sourceActor.actor.change_style_pseudo_class("checked", open);
    },

    destroy: function() {
        if(this._orientationId) {
            this.launcher.disconnect(this._orientationId);
            this._orientationId = null;
        }
        ConfigurableMenus.ConfigurableMenu.prototype.destroy.call(this);
    }
};

/**
 * #Applet
 * @short_description: Base applet class
 *
 * @actor (St.BoxLayout): Actor of the applet
 * @instance_id (int): Instance id of the applet
 * @_uuid (string): UUID of the applet. This is set *after*
 * the applet is loaded.
 * @_panelLocation (St.BoxLayout): Panel sector containing the applet. This is
 * set *after* the applet is loaded.
 * @panel (Panel.Panel): The panel object containing the applet. This is set
 * *after* the applet is loaded.
 * @_meta (JSON): The metadata of the applet. This is set *after* the applet is loaded.
 * @_order (int): The order of the applet within a panel location This is set
 * *after* the applet is loaded.
 * @_draggable (Dnd._Draggable): The draggable object of the applet
 * @_scaleMode (boolean): Whether the applet scales according to the panel size
 * @_menuManager (PopupMenu.PopupMenuManager): The menu manager of the applet
 * @_applet_context_menu (Applet.AppletContextMenu): The context menu of the applet
 * @_applet_tooltip_text (string): Text of the tooltip
 * @_allowedLayout (Applet.AllowedLayout): The allowed layout of the applet. This
 * determines the type of panel an applet is allowed in. By default this is set
 * to Applet.AllowedLayout.HORIZONTAL
 *
 * Base applet class that other applets can inherit
 */
function Applet(orientation, panelHeight, instance_id) {
    this._init(orientation, panelHeight, instance_id);
}

Applet.prototype = {

    /**
     * _init:
     * @orientation (St.Side): orientation of the applet; Orientation of panel containing the actor
     * @panelHeight (int): height of the panel containing the applet
     * @instance_id (int): instance id of the applet
     */
    _init: function(orientation, panel_height, instance_id) {

        this.actor = new St.BoxLayout({ style_class: 'applet-box',
                                        reactive: true,
                                        track_hover: true });

        this._allowedLayout = AllowedLayout.HORIZONTAL;
        this.setOrientationInternal(orientation);

        //Add our search path
        Gtk.IconTheme.get_default().append_search_path(MyExtension.dir.get_child("icons").get_path());

        this.actor.connect('button-release-event', Lang.bind(this, this._onButtonReleaseEvent));
        this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPressEvent));

        this._menuManager = new ConfigurableMenus.ConfigurableMenuManager(this);
        this._applet_context_menu = new AppletContextMenu(this, orientation);
        this._menuManager.addMenu(this._applet_context_menu);

        this.actor._applet = this;  // Backlink to get the applet from its actor
                                    // (handy when we want to know stuff about a particular applet within the panel)
        this.actor._delegate = this;
        this._order = 0;        // Defined in gsettings, this is the order of the applet within a panel location.
                                // This value is set by Cinnamon when loading/listening_to gsettings.
        this._newOrder = null;      //  Used when moving an applet
        this._panelLocation = null;     // Backlink to the panel location our applet is in, set when applet is added to a panel.
        this._newPanelLocation = null;  //  Used when moving an applet
        this._applet_enabled = true;    // Whether the applet is enabled or not (if not it hides in the panel as if it wasn't there)
        this._orientation = orientation;  // orientation of the panel the applet is on  St.Side.TOP BOTTOM LEFT RIGHT

        this._panelHeight = panel_height ? panel_height : 25;
        this.instance_id = instance_id; // Needed by appletSettings
        this._uuid = MyExtension.uuid;      // Defined by the extension.
        //this._hook = null;      // Defined in metadata.json, set the extension metadata
        this._meta = MyExtension.metadata;      // set by the extension
        this._dragging = false;
        this._draggable = DND.makeDraggable(this.actor);
        this._draggable.connect('drag-begin', Lang.bind(this, this._onDragBegin));
        this._draggable.connect('drag-cancelled', Lang.bind(this, this._onDragCancelled));
        this._draggable.connect('drag-end', Lang.bind(this, this._onDragEnd));

        this._scaleMode = false;

        this.context_menu_item_remove = null;
        this.context_menu_separator = null;
        this.keybindingManager = new KeybindingManager();
    },

    _onDragBegin: function() {
        this._dragging = true;
    },

    _onDragEnd: function() {
        this._dragging = false;
    },

    _onDragCancelled: function() {
        this._dragging = false;
    },

    getDragActor: function() {
        let clone = new Clutter.Clone({ source: this.actor });
        clone.width = this.actor.width;
        clone.height = this.actor.height;
        return clone;
    },

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource: function() {
        return this.actor;
    },

    _onButtonReleaseEvent: function (actor, event) {
    /*    if (this._applet_enabled) {
            if (event.get_button() == 1) {
                if (!this._draggable.inhibit) {
                    if (this._applet_context_menu.isOpen) {
                        this._applet_context_menu.toggle();
                    }
                    this.on_applet_clicked(event);
                }
            }
            if (event.get_button() == 3) {
                if (this._applet_context_menu.getMenuItems().length > 0) {
                    this._applet_context_menu.toggle();
                }
            }
        }
        return true;*/
    },

    _onButtonPressEvent: function (actor, event) {
        if (this._applet_enabled) {
            if (event.get_button() == 1) {
                if (!this._draggable.inhibit) {
                    if (this._applet_context_menu.isOpen) {
                        this._applet_context_menu.toggle();
                    }
                    this.on_applet_clicked(event);
                }
            }
            if (event.get_button() == 3) {
                if (this._applet_context_menu._getMenuItems().length > 0) {
                    this._applet_context_menu.toggle();
                }
            }
        }
        return true;
    },

    /**
     * set_applet_tooltip:
     * @text (string): the tooltip text to be set
     *
     * Sets the tooltip of the applet
     */
    set_applet_tooltip: function (text) {
    },

    /**
     * set_applet_enabled:
     * @enabled (boolean): whether this applet is enabled or not
     *
     * Sets whether the applet is enabled or not. A disabled applet sets its
     * padding to 0px and doesn't react to clicks
     */
    set_applet_enabled: function (enabled) {
        if (enabled != this._applet_enabled) {
            this._applet_enabled = enabled;
            this.actor.visible = enabled;
        }
    },

    /**
     * on_applet_clicked:
     * @event (Clutter.Event): the event object
     *
     * This function is called when the applet is clicked.
     *
     * This is meant to be overridden in individual applets.
     */
    on_applet_clicked: function(event) {
        // Implemented by Applets
    },


    /**
     * on_applet_instances_changed:
     *
     * This function is called when an applet *of the same uuid* is added or
     * removed from the panels. It is intended to assist in delegation of
     * responsibilities between duplicate applet instances.
     *
     * This is meant to be overridden in individual applets
     */
    on_applet_instances_changed: function() {

    },

    /**
     * on_applet_added_to_panel:
     *
     * This function is called when the applet is added to the panel.
     *
     * This is meant to be overridden in individual applets.
     */
    on_applet_added_to_panel: function(userEnabled) { 
    },

    // should only be called by appletManager
    _onAppletAddedToPanel: function(userEnabled) {
        /*if (userEnabled) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, Lang.bind(this, function() {
                let [x, y] = this.actor.get_transformed_position();
                let [w, h] = this.actor.get_transformed_size();
                let flashspot = new Flashspot.Flashspot({ x : x, y : y, width: w, height: h});
                flashspot.fire();
                return false;
            }));
        }*/
        if(this.actor.get_parent()) {
            this._newPanelLocation = this.actor.get_parent();
        }
        this.on_applet_added_to_panel(userEnabled);
    },

    /**
     * on_applet_removed_from_panel:
     *
     * This function is called when the applet is removed from the panel.
     *
     * This is meant to be overridden in individual applets.
     */
    on_applet_removed_from_panel: function(deleteConfig) {
    },

    // should only be called by appletManager
    _onAppletRemovedFromPanel: function(deleteConfig) {
        //global.settings.disconnect(this._panelEditModeChangedId);
        this.keybindingManager.destroy();
        this.keybindingManager = null;
        this.on_applet_removed_from_panel(deleteConfig);
    },

    /**
     * setOrientationInternal:
     * @orientation (St.Side): the orientation
     *
     * Sets the orientation of the St.BoxLayout.
     *
     */
    setOrientationInternal: function (orientation) {
        if (orientation == St.Side.LEFT || orientation == St.Side.RIGHT) {
            this.actor.add_style_class_name('vertical');
            this.actor.set_vertical(true);
            this.actor.set_x_expand(true);
        } else {
            this.actor.remove_style_class_name('vertical');
            this.actor.set_vertical(false);
        }
    },

    /**
     * setOrientation:
     * @orientation (St.Side): the orientation
     *
     * Sets the orientation of the applet.
     *
     */
    setOrientation: function (orientation) {
        this.setOrientationInternal(orientation);
        this.on_orientation_changed(orientation);
        this.emit("orientation-changed", orientation);
        this.finalizeContextMenu();
    },

    /**
     * setAllowedLayout:
     * @layout (AllowedLayout): the allowed layout
     *
     * Sets the layout allowed by the applet. Possible values are
     * AllowedLayout.HORIZONTAL, AllowedLayout.VERTICAL, and
     * AllowedLayout.BOTH.
     */
    setAllowedLayout: function (layout) {
        this._allowedLayout = layout;
    },

    /**
     * getAllowedLayout:
     *
     * Retrieves the type of layout an applet is allowed to have.
     *
     * Returns (Applet.AllowedLayout): The allowed layout of the applet
     */
    getAllowedLayout: function() {
        return this._allowedLayout;
    },

    /**
     * on_orientation_changed:
     * @orientation (St.Side): new orientation of the applet
     *
     * This function is called when the applet is changes orientation.
     *
     * This is meant to be overridden in individual applets.
     */
    on_orientation_changed: function(orientation) {
        // Implemented by Applets
    },

    /**
     * setPanelHeight:
     * @panelHeight (int): panelHeight
     *
     * Sets the panel height property of the applet.
     */
    setPanelHeight: function (panel_height) {
        if (panel_height && panel_height > 0) {
            this._panelHeight = panel_height;
        }
        this.on_panel_height_changed_internal();
    },

    /**
     * on_panel_height_changed_internal:
     *
     * This function is called when the panel containing the applet changes height
     */
    on_panel_height_changed_internal: function() {
        this.on_panel_height_changed();
    },

    /**
     * on_panel_height_changed:
     *
     * This function is called when the panel containing the applet changes height
     *
     * This is meant to be overridden in individual applets.
     */
    on_panel_height_changed: function() {
        // Implemented byApplets
    },

    finalizeContextMenu: function () {
        // Add default context menus if we're in panel edit mode, ensure their removal if we're not
        let items = this._applet_context_menu._getMenuItems();

        if (this.context_menu_item_remove == null) {
            this.context_menu_item_remove = new ConfigurableMenus.ConfigurableBasicPopupMenuItem(_("Remove '%s'").format(_(this._meta.name)));
            this.context_menu_item_remove.setIconName("edit-delete");
            this.context_menu_item_remove.setIconVisible(true);
            //this.context_menu_item_remove.setIconType(St.IconType.SYMBOLIC);
            this.context_menu_item_remove.setIconSymbolic(true);
            this.context_menu_item_remove.connect('activate', Lang.bind(this, function() {
                let enabled = global.settings.get_strv('enabled-extensions');
                let index = enabled.indexOf(MyExtension.uuid);
                if (index > -1) {
                    enabled.splice(index, 1);
                }
                global.settings.set_strv('enabled-extensions', enabled);
            }));
        }

        if (this.context_menu_item_about == null) {
            this.context_menu_item_about = new ConfigurableMenus.ConfigurableBasicPopupMenuItem(_("About..."));
            this.context_menu_item_about.setIconName("dialog-question");
            this.context_menu_item_about.setIconVisible(true);
            //this.context_menu_item_about.setIconType(St.IconType.SYMBOLIC);
            this.context_menu_item_about.setIconSymbolic(true);
            this.context_menu_item_about.connect('activate', Lang.bind(this, this.openAbout));
        }

        if (this.context_menu_separator == null) {
            this.context_menu_separator = new ConfigurableMenus.ConfigurableSeparatorMenuItem();
        }

        if (this._applet_context_menu._getMenuItems().length > 0) {
            this._applet_context_menu.addMenuItem(this.context_menu_separator);
        }

        if (items.indexOf(this.context_menu_item_about) == -1) {
            this._applet_context_menu.addMenuItem(this.context_menu_item_about);
        }

        if (!this._meta["hide-configuration"] && GLib.file_test(MyExtension.path + "/settings-schema.json", GLib.FileTest.EXISTS)) {
            if (this.context_menu_item_configure == null) {            
                this.context_menu_item_configure = new ConfigurableMenus.ConfigurableBasicPopupMenuItem(_("Configure..."));
                this.context_menu_item_configure.setIconName("system-run");
                this.context_menu_item_configure.setIconVisible(true);
                //this.context_menu_item_configure.setIconType(St.IconType.SYMBOLIC);
                this.context_menu_item_configure.setIconSymbolic(true);
                this.context_menu_item_configure.connect('activate', Lang.bind(this, this.configureApplet));
            }
            if (items.indexOf(this.context_menu_item_configure) == -1) {
                this._applet_context_menu.addMenuItem(this.context_menu_item_configure);
            }
        }

        if (items.indexOf(this.context_menu_item_remove) == -1) {
            this._applet_context_menu.addMenuItem(this.context_menu_item_remove);
        }
    },

    /**
     * highlight:
     * @highlight (boolean): whether to turn on or off
     *
     * Turns on/off the highlight of the applet
     */
    highlight: function(highlight) {
        if(highlight)
           this.actor.add_style_pseudo_class("highlight");
        else
           this.actor.remove_style_pseudo_class("highlight");
    },

    openAbout: function() {
        new SpicesAboutDialog(this._meta, "applets");
    },

    configureApplet: function() {
        Util.spawnCommandLine("gnome-shell-extension-prefs " + this.uuid);
    }
};
Signals.addSignalMethods(Applet.prototype);

/**
 * #IconApplet:
 * @short_description: Applet with icon
 *
 * @_applet_icon (St.Icon): Actor of the icon
 *
 * Applet that contains an icon
 *
 * Inherits: Applet.Applet
 */
function IconApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

IconApplet.prototype = {
    __proto__: Applet.prototype,

    /**
     * _init:
     * @orientation (St.Side): orientation of the applet; Orientation of panel containing the actor
     * @panelHeight (int): height of the panel containing the applet
     * @instance_id (int): instance id of the applet
     */
    _init: function(orientation, panel_height, instance_id) {
        Applet.prototype._init.call(this, orientation, panel_height, instance_id);

        this._applet_icon_box = new St.Bin(); // https://developer.gnome.org/st/stable/StBin.htm
        this.isSymbolic = false;

        this._applet_icon_box.set_fill(true,true);
        this._applet_icon_box.set_alignment(St.Align.MIDDLE,St.Align.MIDDLE);
        this.actor.add(this._applet_icon_box);
    },

    /**
     * set_applet_icon_name:
     * @icon_name (string): Name of the icon
     *
     * Sets the icon of the applet to @icon_name.
     *
     * The icon will be full color
     */
    set_applet_icon_name: function (icon_name) {
        this._ensureIcon();

        this._applet_icon.set_icon_name(icon_name);
        this.isSymbolic = true;
        this._setStyle();
    },

    /**
     * set_applet_icon_symbolic_name:
     * @icon_name (string): Name of the icon
     *
     * Sets the icon of the applet to @icon_name.
     *
     * The icon will be symbolic
     */
    set_applet_icon_symbolic_name: function (icon_name) {
        this._ensureIcon();

        this._applet_icon.set_icon_name(icon_name+"-symbolic");
        this.isSymbolic = true;
        this._setStyle();
    },

    /**
     * set_applet_icon_path:
     * @icon_path (string): path of the icon
     *
     * Sets the icon of the applet to the image file at @icon_path
     *
     * The icon will be full color
     */
    set_applet_icon_path: function (icon_path) {
        this._ensureIcon();

        try {
            let file = Gio.file_new_for_path(icon_path);
            this._applet_icon.set_gicon(new Gio.FileIcon({ file: file }));
            this.isSymbolic = false;
            this._setStyle();
        } catch (e) {
            global.log(e);
        }
    },

    /**
     * set_applet_icon_symbolic_path:
     * @icon_path (string): path of the icon
     *
     * Sets the icon of the applet to the image file at @icon_path
     *
     * The icon will be symbolic
     */
    set_applet_icon_symbolic_path: function(icon_path) {
        this._ensureIcon();

        try {
            let file = Gio.file_new_for_path(icon_path);
            this._applet_icon.set_gicon(new Gio.FileIcon({ file: file }));
            this.isSymbolic = true;
            this._setStyle();
        } catch (e) {
            global.log(e);
        }
    },

    _ensureIcon: function() {
        if (!this._applet_icon)
            this._applet_icon = new St.Icon({ reactive: true, track_hover: true, style_class: 'applet-icon'});

        this._applet_icon_box.set_child(this._applet_icon);
    },

    _getScale: function() {
        try {
            let scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            if(scale)
                return scale;
        } catch(e) {
            //do nothing
        }
        return 1;
    },

    _setStyle: function() {
        let scale = this._getScale();
        let symb_scaleup = ((this._panelHeight / DEFAULT_PANEL_HEIGHT) * PANEL_SYMBOLIC_ICON_DEFAULT_HEIGHT) / scale;
        let fullcolor_scaleup = this._panelHeight * COLOR_ICON_HEIGHT_FACTOR / scale;

        if(this.isSymbolic) {
            this._applet_icon.set_icon_size(this._scaleMode ?
                                            fullcolor_scaleup :
                                            DEFAULT_ICON_HEIGHT);
            this._applet_icon.set_style_class_name('applet-icon');
        } else {
            this._applet_icon.set_icon_size(this._scaleMode ?
                                            symb_scaleup :
                                            -1);
            this._applet_icon.set_style_class_name('system-status-icon');
        }
    },

    on_panel_height_changed_internal: function() {
        if (this._applet_icon)
            this._setStyle();
        this.on_panel_height_changed();
    }
};

/**
 * #TextApplet:
 * @short_description: Applet with label
 * @_applet_label (St.Label): Label of the applet
 *
 * Applet that displays a text
 *
 * Inherits: Applet.Applet
 */
function TextApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

TextApplet.prototype = {
    __proto__: Applet.prototype,

    /**
     * _init:
     * @orientation (St.Side): orientation of the applet; Orientation of panel containing the actor
     * @panelHeight (int): height of the panel containing the applet
     * @instance_id (int): instance id of the applet
     *
     * Note that suitability for display in a vertical panel is handled by having applets declare
     * they work OK, handled elsewhere
     */
    _init: function(orientation, panel_height, instance_id) {
        Applet.prototype._init.call(this, orientation, panel_height, instance_id);
        this._applet_label = new St.Label({ reactive: true,
                                            track_hover: true,
                                            style_class: 'applet-label'});
        this._applet_label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        this._layoutBin = new St.Bin();
        this._layoutBin.set_child(this._applet_label);

        this.actor.add(this._layoutBin, { y_align: St.Align.MIDDLE,
                                          y_fill: false });
        this.actor.set_label_actor(this._applet_label);
    },

    /**
     * set_applet_label:
     * @text (string): text to be displayed at the label
     *
     * Sets the text of the actor to @text
     */
    set_applet_label: function (text) {
        this._applet_label.set_text(text);
    },

    on_applet_added_to_panel: function() {
    }
};

/**
 * #TextIconApplet:
 * @short_description: Applet with icon and label
 * @_applet_label (St.Label): Label of the applet
 *
 * Applet that displays an icon and a text. The icon is on the left of the text
 *
 * Inherits: Applet.IconApplet
 * Note that suitability for display in a vertical panel is handled by having applets declare
 * they work OK, handled elsewhere
 */
function TextIconApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

TextIconApplet.prototype = {
    __proto__: IconApplet.prototype,

    /**
     * _init:
     * @orientation (St.Side): orientation of the applet; Orientation of panel containing the actor
     * @panelHeight (int): height of the panel containing the applet
     * @instance_id (int): instance id of the applet
     */
    _init: function(orientation, panel_height, instance_id) {
        IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this._applet_label = new St.Label({ reactive: true,
                                            track_hover: true,
                                            style_class: 'applet-label'});
        this._applet_label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        this._layoutBin = new St.Bin();
        this._layoutBin.set_child(this._applet_label);

        this.actor.add(this._layoutBin, { y_align: St.Align.MIDDLE,
                                          y_fill: false });
        this.actor.set_label_actor(this._applet_label);
    },

    /**
     * update_label_margin:
     *
     * Sets a margin between the icon and the label when it contains a non
     * empty string. The margin is always set to zero in a vertical panel
     */
    update_label_margin: function () {
        let text = this._applet_label.get_text();

        if ((text && text != "") && this._applet_icon_box.child &&
            (this._orientation == St.Side.TOP || this._orientation == St.Side.BOTTOM)) {
            this._applet_label.set_margin_left(6.0);
        } else {
            this._applet_label.set_margin_left(0);
        }
    },

    /**
     * set_applet_label:
     * @text (string): text to be displayed at the label
     *
     * Sets the text of the actor to @text
     */
    set_applet_label: function (text) {
        this._applet_label.set_text(text);
        this.update_label_margin();
    },

    /**
     * set_applet_enabled:
     * @enabled (boolean): whether this applet is enabled or not
     *
     * Sets whether the applet is enabled or not. A disabled applet sets its
     * padding to 0px and doesn't react to clicks
     */
    set_applet_enabled: function (enabled) {
        if (enabled != this._applet_enabled) {
            this._applet_enabled = enabled;
            this.actor.visible = enabled;
            if (this._applet_icon) {
                this._applet_icon.visible = enabled;
            }
        }
    },

    /**
     * hide_applet_label:
     * @hide (boolean): whether the applet label is hidden or not
     *
     * Sets whether the applets label is hidden or not. A convenience
     * function to hide applet labels when an applet is placed in a vertical
     * panel
     */
    hide_applet_label: function (hide) {
        if (hide) {
            this._applet_label.hide();
            this._layoutBin.hide();
        } else {
            this._applet_label.show();
            this._layoutBin.show();
        }

        this.update_label_margin();
    },

    /**
     * hide_applet_icon:
     *
     * Hides the icon of the applet
     */
    hide_applet_icon: function () {
        this._applet_icon_box.child = null;
    },

    on_applet_added_to_panel: function() {

    }
};

