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

const HudSearchProvider = new Lang.Class({
    Name: 'HudSearchProvider',

    _init: function() {
        this.id = 'hud';
        this.name = "Gnome Hud";
        this.isEnabled = false;
        this.currentWindow = null;
        this.indicator = null;
        this.display = null;
        this.appData = null;
        this._indicatorId = 0;
        this._focusId = 0;
        this._hack();
    },

    // Hack, I don't know what is doing gnome... A missing function, this is intentional?
    _hack: function() {
        Main.overview.viewSelector._real_addSearchProvider = Main.overview.viewSelector.addSearchProvider;
        if(!Main.overview.viewSelector.addSearchProvider) {
            Main.overview.viewSelector.addSearchProvider = function(searchProvider) {
                Main.overview.viewSelector._searchResults._registerProvider(searchProvider);
            };
        }
        Main.overview.viewSelector._real_removeSearchProvider = Main.overview.viewSelector.removeSearchProvider;
        if(!Main.overview.viewSelector.removeSearchProvider) {
            Main.overview.viewSelector.removeSearchProvider = function(searchProvider) {
                Main.overview.viewSelector._searchResults._unregisterProvider(searchProvider);
            };
        }
    },

    enable: function() {
        if (!this.isEnabled) {
            this._hackDisplay(true);
            Main.overview.addSearchProvider(this);
            this.isEnabled = true;
        }
    },

    disable: function() {
        if (this.isEnabled) {
            Main.overview.removeSearchProvider(this);
            this._hackDisplay(false);
            this.isEnabled = false;
        }
    },

    setIndicator: function(indicator) {
        if(this.indicator != indicator) {
            if(this.indicator && (this._indicatorId > 0)) {
                this.indicator.disconnect(this._indicatorId);
                this._indicatorId = 0;
            }
            this.indicator = indicator;
            if(this.indicator && (this._indicatorId == 0)) {
                this._indicatorId = this.indicator.connect('appmenu-changed', Lang.bind(this, this._onAppmenuChanged));
            }
            this.disable();
            this.enable();
        }
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

    _hackDisplay: function(hack) {
        let sr = Main.overview.viewSelector._searchResults;
        if(sr && sr._content) {
            if(hack) {
                if(!this.display) {
                    this.display = new HudListSearchResults(this);
                    this.display.actor.hide();
                }
                if(sr._keyFocusIn && (this._focusId == 0))
                    this._focusId = this.display.connect('key-focus-in', Lang.bind(sr, sr._keyFocusIn));
                if(this.display.actor && !sr._content.contains(this.display.actor))
                    sr._content.add(this.display.actor);
            } else {
                try {
                    if(this._focusId != 0)
                        this.display.disconnect(this._focusId);
                } catch(e) {} // Do nothing, this mean there a loock screen.
                if(this.display.actor && sr._content && sr._content.contains(this.display.actor))
                    sr._content.remove_actor(this.display.actor);
                if(this.display) {
                    this.display.destroy();
                    this.display = null;
                }
            }
        }
    },

    activateResult: function(id, terms) {
        if(this.indicator && this.appData && this.appData["dbusMenu"]) {
            let items = this.appData["dbusMenu"].getItems();
            if(id in items) {
                items[id].active();
            }
        }
    },

    getResultMetas: function(items, callback) {
        let metas = [];
        if(this.indicator && this.appData && this.appData["dbusMenu"]) {
            let allItems = this.appData["dbusMenu"].getItems();
            for (let pos in items) {
                let id = items[pos];
                let item = allItems[id];
                metas.push({
                    'id': id,
                    'name': item.getLabel(),
                    'createIcon': function(size) {
                        return new St.Icon({ gicon: item.getIcon(size), icon_size: size });
                    }
                });
            }
        }
        callback(metas);
    },

    filterResults: function(results, maxNumber) {
        return results.slice(0, maxNumber);
    },

    _searchFor: function(item, terms) {
        let label = item.getLabel().toLowerCase();
        for(let pos in terms) {
            if(label.indexOf(terms[pos].toLowerCase()) != -1) {
                return 1;
            }
        }
        return 0;
    },

    getInitialResultSet: function(terms, callback, cancellable) {
        let results = [];
        if(this.indicator && this.appData && this.appData["dbusMenu"]) {
            let items = this.appData["dbusMenu"].getItems();
            let menuItemClass = ConfigurableMenus.FactoryClassTypes.MenuItemClass;
            for(let id in items) {
                let item = items[id];
                if((item.getFactoryType() == menuItemClass) &&
                   (this._searchFor(item, terms) > 0)) {
                    results.push(id);
                }
            }
        }
        callback(results);
    },

    getSubsearchResultSet: function(previousResults, terms, callback, cancellable) {
        this.getInitialResultSet(terms, callback, cancellable);
    },

    createResultObject: function (resultMeta) {
        if(this.indicator && this.appData &&
          ("dbusMenu" in this.appData) &&
          (resultMeta['id'] in this.appData["dbusMenu"])) {
           return this.appData["dbusMenu"][resultMeta['id']];
        }
        return null;
    },

    getIcon: function(size) {
        let gicon = null;
        let iconTheme = Gtk.IconTheme.get_default();
        iconTheme.prepend_search_path(MyExtension.path);
        let iconInfo = iconTheme.lookup_icon("icon", size, Gtk.IconLookupFlags.GENERIC_FALLBACK);
        // no icon? that's bad!
        if (iconInfo === null) {
            global.logError("unable to lookup icon for '" + name + "'");
        } else {
            // create a gicon for the icon
            gicon = Gio.icon_new_for_string(iconInfo.get_filename());
        }
        return gicon;
    },

    getName: function() {
        return this.name;
    },

    destroy: function() {
        this.setIndicator(null);
        this.disable();
        this.id = null;
        this.name = null;
        this.isEnabled = false;
        this.currentWindow = null;
        this.appData = null;
        if(Main.overview.viewSelector._real_addSearchProvider != Main.overview.viewSelector.addSearchProvider) {
            Main.overview.viewSelector.addSearchProvider = Main.overview.viewSelector._real_addSearchProvider;
            Main.overview.viewSelector._real_addSearchProvider = null;
        }
        if(Main.overview.viewSelector._real_removeSearchProvider != Main.overview.viewSelector.removeSearchProvider) {
            Main.overview.viewSelector.removeSearchProvider = Main.overview.viewSelector._real_removeSearchProvider;
            Main.overview.viewSelector._real_removeSearchProvider = null;
        }
    },
});

const HudProviderIcon = new Lang.Class({
    Name: 'HudProviderIcon',
    Extends: St.Button,

    PROVIDER_ICON_SIZE: 48,

    _init: function(provider) {
        this.provider = provider;
        this.parent({
            style_class: 'search-provider-icon',
            reactive: true,
            can_focus: true,
            accessible_name: provider.getName(),
            track_hover: true
        });

        this._content = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this.set_child(this._content);

        let rtl = (this.get_text_direction() == Clutter.TextDirection.RTL);

        this.moreIcon = new St.Widget({
            style_class: 'search-provider-icon-more',
            visible: false,
            x_align: rtl ? Clutter.ActorAlign.START : Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true
        });

        this.icon = new St.Icon({
            icon_size: this.PROVIDER_ICON_SIZE,
            gicon: provider.getIcon(this.PROVIDER_ICON_SIZE)
        });
        this._content.add_actor(this.icon);
        this._content.add_actor(this.moreIcon);
    },
 
    setIcon: function(gicon) {
        this.icon.set_gicon(gicon);
    },

    animateLaunch: function() {
        IconGrid.zoomOutActor(this._content);
    }
});

const HubListSearchResult = new Lang.Class({
    Name: 'HubListSearchResult',
    Extends: Search.SearchResult,

    ICON_SIZE: 32,

    _init: function(provider, metaInfo) {
        this.parent(provider, metaInfo);

        this.actor.style_class = 'list-search-result';
        this.actor.x_fill = true;

        let content = new St.BoxLayout({
            style_class: 'list-search-result-content',
            vertical: false
        });
        this.actor.set_child(content);

        // An icon for, or thumbnail of, content
        let icon = this.metaInfo['createIcon'](this.ICON_SIZE);
        if (icon) {
            content.add(icon);
        }

        let details = new St.BoxLayout({ vertical: true });
        content.add(details, {
            x_fill: true,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });

        let title = new St.Label({
            style_class: 'list-search-result-title',
            text: this.metaInfo['name']
        });
        details.add(title, {
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.START
        });
        this.actor.label_actor = title;

        if (this.metaInfo['description']) {
            let description = new St.Label({ style_class: 'list-search-result-description' });
            description.clutter_text.set_markup(this.metaInfo['description']);
            details.add(description, {
                x_fill: false,
                y_fill: false,
                x_align: St.Align.START,
                y_align: St.Align.END
            });
        }
    },
});

const HudListSearchResults = new Lang.Class({
    Name: 'HudListSearchResults',
    Extends: Search.SearchResultsBase,

    _init: function(provider) {
        this.parent(provider);

        this._container = new St.BoxLayout({ style_class: 'search-section-content' });
        this.providerIcon = new HudProviderIcon(provider);
        this.providerIcon.connect('key-focus-in', Lang.bind(this, this._keyFocusIn));
        this.providerIcon.connect('clicked', Lang.bind(this, function() {
            this.providerIcon.animateLaunch();
            provider.launchSearch(this._terms);
            Main.overview.toggle();
        }));

        this._container.add(this.providerIcon, {
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.START
        });

        this._content = new St.BoxLayout({
            style_class: 'list-search-results',
            vertical: true
        });
        this._container.add(this._content, { expand: true });

        this._resultDisplayBin.set_child(this._container);
    },

    _setMoreIconVisible: function(visible) {
        this.providerIcon.moreIcon.visible = visible;
    },

    _getMaxDisplayedResults: function() {
        return MAX_LIST_SEARCH_RESULTS_ROWS;
    },

    _clearResultDisplay: function () {
        this._content.remove_all_children();
    },

    _createResultDisplay: function(meta) {
        return this.parent(meta) || new HubListSearchResult(this.provider, meta);
    },

    _addItem: function(display) {
        this._content.add_actor(display.actor);
    },

    getFirstResult: function() {
        if (this._content.get_n_children() > 0)
            return this._content.get_child_at_index(0)._delegate;
        return null;
    },

    destroy: function() {
        if (this.actor) {
            this.parent();
            this.actor = null;
        }
    }
});
Signals.addSignalMethods(HudListSearchResults.prototype);
