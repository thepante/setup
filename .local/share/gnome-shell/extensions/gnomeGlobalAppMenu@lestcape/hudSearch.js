// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;
const Signals = imports.signals;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;

const Search = imports.ui.search;
const Main = imports.ui.main;
const IconGrid = imports.ui.iconGrid;
const AppDisplay = imports.ui.appDisplay;

const MyExtension = imports.misc.extensionUtils.getCurrentExtension();
const ConfigurableMenus = MyExtension.imports.configurableMenus;

const MAX_LIST_SEARCH_RESULTS_ROWS = 20;
var hudSearchProvider = null;

function GlobalMenuSearch() {
   this._init.apply(this, arguments);
}

GlobalMenuSearch.prototype = {
    __proto__: ConfigurableMenus.ConfigurableMenu.prototype,

    _init: function(launcher) {
        ConfigurableMenus.ConfigurableMenu.prototype._init.call (this, launcher, 0.0, St.Side.TOP, true);
        this.actor.add_style_class_name("hud-menu");
        this.indicator = null;
        this.currentWindow = null;
        this.appData = null;
        this._indicatorId = 0;
        this.isEnabled = true;
        this._maxItems = 0;

        let searchBox = new ConfigurableMenus.ConfigurablePopupMenuSection();
        this.entryBox = new ConfigurableMenus.ConfigurableEntryItem("", "Search");
        searchBox.addMenuItem(this.entryBox);
        this.itemsBox = new ConfigurableMenus.ArrayBoxLayout();
        this.addMenuItem(searchBox);
        this.addMenuItem(this.itemsBox);
        this.itemsBox.scrollBox.setAutoScrolling(true);

        this.setMaxHeight();
        this.connect('open-state-changed', Lang.bind(this, this._onMenuOpenStateChanged));
        this.entryBox.connect('text-changed', Lang.bind(this, this._onTextChanged));
        this.entryBox.searchEntryText.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));
    },

    _onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();
        if(this.isOpen) {
            let menuItems = this.itemsBox.getAllMenuItems();
            if(!this._activeMenuItem && (menuItems.length > 0)) {
                this._activeMenuItem = menuItems[0];
                this._activeMenuItem.setActive(true);
            }
            if(symbol == Clutter.Escape) {
                this.close(true);
                return true;
            } else if(symbol == Clutter.KEY_Return) {
                this._activeMenuItem.activate();
                return true;
            }
            let index = menuItems.indexOf(this._activeMenuItem);
            if(symbol == Clutter.KEY_Down) {
                this._activeMenuItem.setActive(false);
                if(index < menuItems.length - 1)
                    this._activeMenuItem = menuItems[index+1];
                else
                    this._activeMenuItem = menuItems[0];
                this._activeMenuItem.setActive(true);
                this.itemsBox.scrollBox.scrollToActor(this._activeMenuItem.actor);
                return true;
            } else if(symbol == Clutter.KEY_Up) {
                this._activeMenuItem.setActive(false);
                if(index > 0)
                    this._activeMenuItem = menuItems[index-1];
                else
                    this._activeMenuItem = menuItems[menuItems.length - 1];
                this._activeMenuItem.setActive(true);
                this.itemsBox.scrollBox.scrollToActor(this._activeMenuItem.actor);
                return true;
            }
        }
        return false;
    },

    _onMenuOpenStateChanged: function(menu, open) {
        if(open) {
            this.entryBox.grabKeyFocus();
            this.searchPattern();
        } else {
            this.entryBox.setText("");
            if(this._activeMenuItem) {
                this._activeMenuItem.setActive(false);
                this._activeMenuItem = null;
            }
            this.itemsBox.removeAllMenuItems();
        }
    },

    _onTextChanged: function(actor, event) {
        if(!this.isChanging && this.entryBox.searchActive) {
            this.searchPattern();
        }
    },

    searchPattern: function() {
        this.itemsBox.removeAllMenuItems();
        if(this.indicator && this.appData && this.appData["dbusMenu"]) {
            let text = this.entryBox.getText();
            let terms = text.trim().split(/\s+/);
            let ids = this._search(terms);
            let items = this.appData["dbusMenu"].getItems();
            let number = (this._maxItems > 0) ? Math.min(this._maxItems, ids.length) : ids.length;
            let menuItems = new Array();
            for(let pos = 0; pos < number; pos++) {
                let id = ids[pos];
                if(id in items) {
                    let item = items[id];
                    let label = this.buildLabelForItem(item);
                    if(label.length > 0) {
                        let componnet = new ConfigurableMenus.ConfigurableApplicationMenuItem(label, { focusOnHover: false, focusOnActivation: false });
                        componnet.setGIcon(item.getIcon(16));
                        componnet.setAccel(item.getAccel());
                        if(item.getToggleType() == "checkmark") {
                            componnet.setOrnament(ConfigurableMenus.OrnamentType.CHECK, item.getToggleState());
                        } else if(item.getToggleType() == "radio") {
                            componnet.setOrnament(ConfigurableMenus.OrnamentType.DOT, item.getToggleState());
                        } else {
                            componnet.setOrnament(ConfigurableMenus.OrnamentType.NONE);
                        }
                        componnet.connect('activate', Lang.bind(this, this._onActivateResult, item, terms));
                        menuItems.push(componnet);
                    }
                }
            }
            for(let pos = 0; pos < Math.min(menuItems.length, 10); pos++) {
                this.itemsBox.addMenuItem(menuItems[pos]);
            }
            if(menuItems.length > 0) {
                this._activeMenuItem = menuItems[0];
                this._activeMenuItem.setActive(true);
            }
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, function() {
                for(let pos = 11; pos < menuItems.length; pos++) {
                    this.itemsBox.addMenuItem(menuItems[pos]);
                }
            }));
        }
    },

    buildLabelForItem: function(item) {
        let label = item.getLabel();
        while(item.getParent() != null) {
            item = item.getParent();
            if (item.getLabel())
                label = item.getLabel() + " ➩ " + label;
        }
        return label;
    },

    setMaxNumberOfItems: function(maxItems) {
        this._maxItems = maxItems;
    },

    setIndicator: function(indicator, window) {
        if(this.indicator != indicator) {
            if(this.indicator && (this._indicatorId > 0)) {
                this.indicator.disconnect(this._indicatorId);
                this._indicatorId = 0;
            }
            this.indicator = indicator;
            if(this.indicator && (this._indicatorId == 0)) {
                this._indicatorId = this.indicator.connect('appmenu-changed', Lang.bind(this, this._onAppmenuChanged));
            }
        }
        this._onAppmenuChanged(indicator, window);
    },

    _onAppmenuChanged: function(indicator, window)  {
        this.appData = null;
        this.currentWindow = window;
        if(this.currentWindow && this.indicator && this.isEnabled) {
            let app = this.indicator.getAppForWindow(window);
            if(app) {
                this.appData = {
                    "icon": this.indicator.getIconForWindow(window),
                    "label": app.get_name(),
                    "dbusMenu": this.indicator.getMenuForWindow(window)
                };
            }
        }
    },

    _onActivateResult: function(self, event, keepMenu, item, terms) {
        if(this.indicator && this.appData && this.appData["dbusMenu"]) {
            item.active();
        }
    },

    _searchFor: function(item, terms) {
        let label = item.getLabel().toLowerCase();
        let matches = 0;
        for(let pos in terms) {
            let index = label.indexOf(terms[pos].toLowerCase());
            if(index == 0) {
                matches += 5;
            } else if(index != -1) {
                matches++;
            }
        }
        return matches;
    },

    _search: function(terms) {
        let priority = {};
        if(this.indicator && this.appData && this.appData["dbusMenu"]) {
            let items = this.appData["dbusMenu"].getItems();
            for(let id in items) {
                let item = items[id];
                let sResult = this._searchFor(item, terms);
                if((item.getFactoryType() == ConfigurableMenus.FactoryClassTypes.MenuItemClass) && (sResult > 0)) {
                    priority[id] = sResult;
                }
            }
        }
        let result = Object.keys(priority).sort(function(a, b) {
            return priority[b] - priority[a]; //Descending sort
        });
        return result;
    },

    // Setting the max-height won't do any good if the minimum height of the
    // menu is higher then the screen; it's useful if part of the menu is
    // scrollable so the minimum height is smaller than the natural height
    setMaxHeight: function() {
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let verticalMargins = this.actor.margin_top + this.actor.margin_bottom;

        // The workarea and margin dimensions are in physical pixels, but CSS
        // measures are in logical pixels, so make sure to consider the scale
        // factor when computing max-height
        let maxHeight = Math.round(40 * (workArea.height - verticalMargins) / (100*scaleFactor));
        this.actor.style = ('max-height: %spx;').format(maxHeight);
    },

    destroy: function() {
        this.setIndicator(null);
        this.currentWindow = null;
        this.appData = null;
        this.isEnabled = false;
        this._maxItems = 0;
        ConfigurableMenus.ConfigurableMenu.prototype.destroy.call();
    },
};
