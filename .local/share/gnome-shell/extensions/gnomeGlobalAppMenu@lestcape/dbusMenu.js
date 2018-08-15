// Copyright (C) 2011 Giovanni Campagna
// Copyright (C) 2013-2014 Jonas Kümmerlin <rgcjonas@gmail.com>
// Copyright (C) 2014-2015 Lester Carballo Pérez <lestcape@gmail.com>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

const Lang = imports.lang;
const Signals = imports.signals;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils.getCurrentExtension();
const ConfigurableMenus = ExtensionUtils.imports.configurableMenus;
const AppletDir = ExtensionUtils.dir.get_path();

const InterfacesDir = Gio.file_new_for_path(AppletDir).get_child("interfaces-xml");
const BusClientProxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXml("DBusMenu.xml"));
const BusGtkClientProxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXml("DBusGtkMenu.xml"));
const ActionsGtkClientProxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXml("ActionsGtk.xml"));

const IconTheme = Gtk.IconTheme.get_default();

// We list all the properties we know and use here, so we won' have to deal with unexpected type mismatches
const MandatedTypes = {
   'visible'          : GLib.VariantType.new("b"),
   'enabled'          : GLib.VariantType.new("b"),
   'label'            : GLib.VariantType.new("s"),
   'type'             : GLib.VariantType.new("s"),
   'children-display' : GLib.VariantType.new("s"),
   'icon-name'        : GLib.VariantType.new("s"),
   'icon-data'        : GLib.VariantType.new("ay"),
   'toggle-type'      : GLib.VariantType.new("s"),
   'toggle-state'     : GLib.VariantType.new("i"),
   'action'           : GLib.VariantType.new("s"),
   //'target'           : GLib.VariantType.new("v"),
   'accel'            : GLib.VariantType.new("s"),
   'shortcut'         : GLib.VariantType.new("aas")
};

const DefaultValues = {
   'visible' : GLib.Variant.new_boolean(true),
   'enabled' : GLib.Variant.new_boolean(true),
   'label'   : GLib.Variant.new_string(""),
   'type'    : GLib.Variant.new_string(""),
   'action'  : GLib.Variant.new_string(""),
   'accel'   : GLib.Variant.new_string("")
   // Elements not in here must return null
};

/**
 * loads a xml file into an in-memory string
 */
function loadInterfaceXml(filename) {

   let file = InterfacesDir.get_child(filename);

   let [result, contents] = GLib.file_get_contents(file.get_path());

   if(result) {
      //HACK: The "" + trick is important as hell because file_get_contents returns
      // an object (WTF?) but Gio.makeProxyWrapper requires `typeof() == "string"`
      // Otherwise, it will try to check `instanceof XML` and fail miserably because there
      // is no `XML` on very recent SpiderMonkey releases (or, if SpiderMonkey is old enough,
      // will spit out a TypeError soon).
      return "<node>" + contents + "</node>";
   } else {
      throw new Error("AppIndicatorSupport: Could not load file: "+filename);
   }
};

//////////////////////////////////////////////////////////////////////////
// PART ONE: "ViewModel" backend implementation.
// Both code and design are inspired by libdbusmenu
//////////////////////////////////////////////////////////////////////////

/**
 * Saves menu property values and handles type checking and defaults
 */
function PropertyStore() {
   this._init.apply(this, arguments);
}

PropertyStore.prototype = {

   _init: function(initProperties) {
      this._props = {};

      if(initProperties) {
         for(let i in initProperties) {
            this.set(i, initProperties[i]);
         }
      }
   },

   set: function(name, value) {
      if(name in MandatedTypes && value && value.is_of_type && !value.is_of_type(MandatedTypes[name]))
         global.log("Cannot set property "+name+": type mismatch!");
      else if(value)
         this._props[name] = value;
      else
         delete this._props[name];
   },

   get: function(name) {
      if(name in this._props)
         return this._props[name];
      else if(name in DefaultValues)
         return DefaultValues[name];
      else
         return null;
   },

   compareNew: function(name, newValue) {
      if(!(name in MandatedTypes))
         return true; 
      if(name in MandatedTypes && newValue && newValue.is_of_type && !newValue.is_of_type(MandatedTypes[name]))
         return false;

      let oldValue = this.get(name);
      if(oldValue == newValue)
         return false;
      if(newValue && !oldValue || oldValue && !newValue)
         return true;

      let isOldContainer = oldValue.is_container();
      let isNewContainer = newValue.is_container();

      if((!isOldContainer) && (!isNewContainer)) {
         return (oldValue.compare(newValue) != 0);
      } else if(isOldContainer != isNewContainer)
         return true;

      let oldArray = oldValue.deep_unpack();
      let newArray = newValue.deep_unpack();
      if(oldArray.length != newArray.length)
         return true;
      for(let child in oldArray) {
         if(!(child in newArray) || (oldArray[child] != newArray[child]))
            return true;
      }
      return false;
   },

   getString: function(propName) {
      let prop = this.getVariant(propName);
      return prop ? prop.get_string()[0] : null;
   },

   getVariant: function(propName) {
      return this.get(propName);
   },

   getBool: function(propName) {
      let prop  = this.getVariant(propName);
      return prop ? prop.get_boolean() : false;
   },

   getInt: function(propName) {
      let prop = this.getVariant(propName);
      return prop ? prop.get_int32() : 0;
   },

   setVariant: function(prop, value) {
      // if(newValue && !oldValue || oldValue && !newValue || oldValue.compare(newValue) != 0)
      if(this.compareNew(prop, value)) {
         this.set(prop, value);
         return true;
      }
      return false;
   }
};

/**
 * Represents a single menu item
 */
function DbusMenuItem() {
   this._init.apply(this, arguments);
}

DbusMenuItem.prototype = {
   __proto__: ConfigurableMenus.PopupMenuAbstractFactory.prototype,

   // Will steal the properties object
   _init: function(id, childrenIds, properties, client) {
      ConfigurableMenus.PopupMenuAbstractFactory.prototype._init.call(this, id, childrenIds, this._createParameters(id, properties, client));
      this._dbusClientGcTag = null;
   },

   updatePropertiesAsVariant: function(properties) {
      let propStore = new PropertyStore(properties);
      if("label" in properties)
         this.setLabel(propStore.getString("label").replace(/_([^_])/, "$1"));
      if("accel" in properties)
         this.setAccel(this._getAccel(propStore.getString("accel")));
      if("shortcut" in properties)
         this.setAccel(this._getShortcut(propStore.getVariant("shortcut")));
      if("enabled" in properties)
         this.setSensitive(propStore.getBool("enabled"));
      if("visible" in properties)
         this.setVisible(propStore.getBool("visible"));
      if("toggle-type" in properties)
         this.setToggleType(propStore.getString("toggle-type"));
      if("toggle-state" in properties)
         this.setToggleState(propStore.getInt("toggle-state"));
      if("icon-name" in properties)
         this.setIconName(propStore.getString("icon-name"));
      if("icon-data" in properties)
         this.setGdkIcon(this._getGdkIcon(propStore.getVariant("icon-data")));
      if(("children-display" in properties)||("type" in properties))
         this.setFactoryType(this._getFactoryType(this._id, propStore.getString('children-display'), propStore.getString('type')));
      if("action" in properties)
         this.setAction(propStore.getString("action"));
      if("param-type" in properties)
         this.setParamType(propStore.getVariant("param-type"));
   },

   getItemById: function(id) {
      if(this._client)
         return this._client.getItem(id);
      return -1;
   },

   handleEvent: function(event, params) {
      if(event in ConfigurableMenus.FactoryEventTypes) {
         if(this._client) {
            this._client.sendEvent(this._id, event, params, 0);
         }
      }
   },

   // FIXME We really don't need the PropertyStore object, and some private function
   // could make a clean on our "unsave" variants.
   _createParameters: function(id, properties, client) {
      this._client = client;
      let propStore = new PropertyStore(properties);
      let params = {};
      if("label" in properties)
         params.label = propStore.getString("label").replace(/_([^_])/, "$1");
      if("accel" in properties)
         params.accel = this._getAccel(propStore.getString("accel"));
      if("shortcut" in properties)
         params.accel = this._getShortcut(propStore.getVariant("shortcut"));
      if("enabled" in properties)
         params.sensitive = propStore.getBool("enabled");
      if("visible" in properties)
         params.visible = propStore.getBool("visible");
      if("toggle-type" in properties)
         params.toggleType = propStore.getString("toggle-type");
      if("toggle-state" in properties)
         params.toggleState = propStore.getInt("toggle-state");
      if("icon-name" in properties)
         params.iconName = propStore.getString("icon-name");
      if("icon-data" in properties)
         params.iconData = this._getGdkIcon(propStore.getVariant("icon-data"));
      if(("children-display" in properties)||("type" in properties))
         params.type = this._getFactoryType(id, propStore.getString('children-display'), propStore.getString('type'))
      if("action" in properties)
         params.action = propStore.getString("action");
      if("param-type" in properties)
         params.paramType = propStore.getVariant("param-type");
      return params;
   },

   _getAccel: function(accelName) {
      if(accelName) {
         // Main.notify("found" + accelName);
         let [key, mods] = Gtk.accelerator_parse(accelName);
         return Gtk.accelerator_get_label(key, mods);
      }
      return null;
   },

   _getShortcut: function(accel) {
      if(accel) {
         let keyArray = accel.deep_unpack();
         if(keyArray && keyArray[0]) {
            let accelName = "";
            let keySequence = keyArray[0];
            let len = keySequence.length;
            if((len == 1)&&(keySequence[0].length == 1))
               return keySequence[0];
            for(let pos in keySequence) {
               let token = keySequence[pos];
               if(pos <= len - 2) {
                  accelName += "<" + token + ">";
               } else {
                  accelName += this._kdeToGtkKey(token);
               } 
            }
            if(accelName == "<>")
               accelName = "+";
            let [key, mods] = Gtk.accelerator_parse(accelName);
            let value = Gtk.accelerator_get_label(key, mods);
            if(!value) { 
               value = accelName; 
            }
            return value;
         }
      }
      return null;
   },

   //FIXME: We need to convert more keys to Gtk?
   _kdeToGtkKey: function(key) {
      let keyLower = key.toLowerCase();
      if(keyLower == "pgup")
         return "Page_Up";
      else if(keyLower == "pgdown")
         return "Page_Down";
      else if(keyLower == "esc")
         return "Escape";
      else if(keyLower == "ins")
         return "Insert";
      else if(keyLower == "del")
         return "Delete";
      else if(keyLower == "space")
         return "space";
      else if(keyLower == "backspace")
         return "BackSpace";
      else if(keyLower == "media stop")
         return "XF86AudioStop";
      else if(keyLower == "media play")
         return "XF86AudioPlay";
      return key;
   },

   _getFactoryType: function(id, childDisplay, childType) {
      if(this._client && (childDisplay || childType)) {
         if((childDisplay == "rootmenu")||(id == this._client.getRootId()))
            return ConfigurableMenus.FactoryClassTypes.RootMenuClass;
         if(childDisplay == "submenu")
            return ConfigurableMenus.FactoryClassTypes.SubMenuMenuItemClass;
         else if(childDisplay == "section")
            return ConfigurableMenus.FactoryClassTypes.MenuSectionMenuItemClass;
         else if(childType == "separator")
            return ConfigurableMenus.FactoryClassTypes.SeparatorMenuItemClass;
         /*else if(this._client.getRoot() == this)
            return ConfigurableMenus.FactoryClassTypes.SeparatorMenuItemClass;*/
         return ConfigurableMenus.FactoryClassTypes.MenuItemClass;
      }
      return null;
   },

   _getGdkIcon: function(value) {
      try {
         if(value) {
            let data = value.get_data_as_bytes()
            let stream = Gio.MemoryInputStream.new_from_bytes(data);
            //Reduce the icon size (ie: the queality of the icons) will be ensure a more faster load?
            //return GdkPixbuf.Pixbuf.new_from_stream_at_scale (stream, 8, 8, true, null);
            return GdkPixbuf.Pixbuf.new_from_stream(stream, null);
         }
      } catch(e) {
         global.log("Error loading icon: " + e.message);
      }
      return null;
   },

   destroy: function() {
      if(this._client) {
         ConfigurableMenus.PopupMenuAbstractFactory.prototype.destroy.call(this);
         this._client = null;
      }
   }
};

/**
 * The client does the heavy lifting of actually reading layouts and distributing events
 */
function DBusClient() {
   this._init.apply(this, arguments);
}

DBusClient.prototype = {

   _init: function(busName, busPath) {
      this._busName = busName;
      this._busPath = busPath;
      this._shellMenu = null;
      // Will be set to true if a layout update is requested while one is already in progress
      // then the handler that completes the layout update will request another update
      this._flagLayoutUpdateRequired = false;
      this._flagLayoutUpdateInProgress = false;
      // Property requests are queued
      this._propertiesRequestedFor = []; // ids
      this._buggyClient = false;

      let initItemId = this.getRootId();

      this._items = {};
      this._items[initItemId] = new DbusMenuItem(initItemId, [],
         { 'children-display': GLib.Variant.new_string('rootmenu'),
           'visible': GLib.Variant.new_boolean(false)
         }, this);

      this._startMainProxy();
   },

   renderMetadata: function() {
      return this._busName + "," + this._busPath;
   },

   getShellMenu: function() {
      return this._shellMenu;
   },

   setShellMenu: function(shellMenu) {
      this._shellMenu = shellMenu;
   },

   getRoot: function() {
      if(this._items && (this.getRootId() in this._items))
         return this._items[this.getRootId()];
      return null;
   },

   getRootId: function() {
      return 0;
   },

   getItems: function() {
       return this._items;
   },

   getItem: function(id) {
      if((this._items)&&(id in this._items))
         return this._items[id];

      global.log("trying to retrieve item for non-existing id "+id+" !?");
      return null;
   },

   sendEvent: function(id, event, params, timestamp) {
      if(event === ConfigurableMenus.FactoryEventTypes.opened) {
         this.fakeSendAboutToShow(id);
      } else if(event === ConfigurableMenus.FactoryEventTypes.closed) {
      } else {
         this._reportEvent(id, event, params, timestamp);
      }
   },

   isBuggyClient: function() {
      return this._buggyClient;
   },

   // We don't need to cache and burst-send that since it will not happen that frequently
   _sendAboutToShow: function(id) {
      if(this._proxyMenu) {
         this._proxyMenu.AboutToShowRemote(id, Lang.bind(this, function(result, error) {
            if(error) {
               global.log("while calling AboutToShow: " + error);
            } else if(result && result[0]) {
               this._requestLayoutUpdate();
            }
         }));
      }
   },

   fakeSendAboutToShow: function(lastId) {
      if(this._items && (lastId in this._items) && 
         (this._items[lastId].getFactoryType() === ConfigurableMenus.FactoryClassTypes.SubMenuMenuItemClass) ||
         (this._items[lastId].getFactoryType() === ConfigurableMenus.FactoryClassTypes.RootMenuClass)) {
         let listId = this._items[lastId].getChildrenIds();
         this._reportEvent(lastId, ConfigurableMenus.FactoryEventTypes.opened, null, 0);
         if((lastId === this.getRootId()) || (listId.length == 0)) {
            this._sendAboutToShow(lastId);
         }
         let id;
         for(let pos in listId) {
            id = listId[pos];
            if(this._items[id].getFactoryType() === ConfigurableMenus.FactoryClassTypes.SubMenuMenuItemClass) {
               this.fakeSendAboutToShow(id);
               this._sendAboutToShow(id);
            }
         }
      }
   },

   _reportEvent: function(id, event, params, timestamp) {
      if(this._proxyMenu) {
         if(!params)
            params = GLib.Variant.new_int32(0);
         this._proxyMenu.EventRemote(id, event, params, timestamp, 
            function(result, error) {}); // We don't care
      }
   },

   _startMainProxy: function() {
      this._proxyMenu = new BusClientProxy(Gio.DBus.session, this._busName, this._busPath,
         Lang.bind(this, this._clientReady));
   },

   _requestLayoutUpdate: function() {
      if(this._flagLayoutUpdateInProgress) {
         this._flagLayoutUpdateRequired = true;
      } else {
         this._beginLayoutUpdate();
      }
   },

   _requestProperties: function(id) {
      // If we don't have any requests queued, we'll need to add one
      if(this._propertiesRequestedFor.length < 1)
         GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, this._beginRequestProperties));

      if(this._propertiesRequestedFor.filter(function(e) { return e === id; }).length == 0)
         this._propertiesRequestedFor.push(id);
   },

   _beginRequestProperties: function() {
      if(this._proxyMenu) {
         this._proxyMenu.GetGroupPropertiesRemote(this._propertiesRequestedFor, [],
            Lang.bind(this, this._endRequestProperties));
         this._propertiesRequestedFor = [];
      }
      return false;
   },

   _endRequestProperties: function(result, error) {
      if(error) {
         global.log("Could not retrieve properties: " + error);
      } else if(this._items) {
         // For some funny reason, the result array is hidden in an array
         result[0].forEach(function([id, properties]) {
            if(!(id in this._items))
               return;

            this._items[id].updatePropertiesAsVariant(properties);
         }, this);
      }
   },

   // Traverses the list of cached menu items and removes everyone that is not in the list
   // so we don't keep alive unused items
   _gcItems: function() {
      if(this._items) {
         let tag = new Date().getTime();
         let toTraverse = [ this.getRootId() ];
         let numberOfItems = 0;
         while (toTraverse.length > 0) {
            let item = this.getItem(toTraverse.shift());
            item._dbusClientGcTag = tag;
            Array.prototype.push.apply(toTraverse, item.getChildrenIds());
            numberOfItems += 1;
         }
         if(!this._buggyClient)
             this._buggyClient = (Object.keys(this._items).length == numberOfItems);
         for(let id in this._items) {
            if(this._items[id]._dbusClientGcTag != tag)
               delete this._items[id];
         }
      }
   },

   // The original implementation will only request partial layouts if somehow possible
   // we try to save us from multiple kinds of race conditions by always requesting a full layout
   _beginLayoutUpdate: function() {
      // We only read the type property, because if the type changes after reading all properties,
      // the view would have to replace the item completely which we try to avoid
      if(this._proxyMenu) {
         this._proxyMenu.GetLayoutRemote(0, -1, [ 'type', 'children-display' ], Lang.bind(this, this._endLayoutUpdate));
         this._flagLayoutUpdateInProgress = true;
      }
      this._flagLayoutUpdateRequired = false;
   },

   _endLayoutUpdate: function(result, error) {
      if(error) {
         global.log("While reading menu layout: " + error);
         return;
      }

      let [revision, root] = result;
      this._doLayoutUpdate(root);

      this._gcItems();

      if(this._flagLayoutUpdateRequired)
         this._beginLayoutUpdate();
      else
         this._flagLayoutUpdateInProgress = false;
   },

   _doLayoutUpdate: function(item) {
      let [id, properties, children] = item;
      if(this._items) {
         let childrenUnpacked = children.map(function(child) { return child.deep_unpack(); });
         let childrenIds = childrenUnpacked.map(function(child) { return child[0]; });

         // Make sure all our children exist
         childrenUnpacked.forEach(this._doLayoutUpdate, this);

         // Make sure we exist
         if(id in this._items) {
            // We do, update our properties if necessary
            this._items[id].updatePropertiesAsVariant(properties);

            // Make sure our children are all at the right place, and exist
            let oldChildrenIds = this._items[id].getChildrenIds();
            for(let i = 0; i < childrenIds.length; ++i) {
               // Try to recycle an old child
               let oldChild = -1;
               for(let j = 0; j < oldChildrenIds.length; ++j) {
                  if(oldChildrenIds[j] == childrenIds[i]) {
                     oldChild = oldChildrenIds.splice(j, 1)[0];
                     break;
                  }
               }

               if(oldChild < 0) {
                  // No old child found, so create a new one!
                  this._items[id].addChild(i, childrenIds[i]);
               } else {
                  // Old child found, reuse it!
                  this._items[id].moveChild(childrenIds[i], i);
               }
            }

            // Remove any old children that weren't reused
            oldChildrenIds.forEach(function(childId) {
               this._items[id].removeChild(childId); 
            }, this);
         } else {
            // We don't, so let's create us
            this._items[id] = new DbusMenuItem(id, childrenIds, properties, this);
            this._requestProperties(id);
         }
      }
      return id;
   },

   _clientReady: function(result, error) {
      if(error) {
         //FIXME: show message to the user?
         global.log("Could not initialize menu proxy: " + error);
         return;
      }
      this._requestLayoutUpdate();

      // Listen for updated layouts and properties
      if(this._proxyMenu) {
         this._proxyMenu.connectSignal("LayoutUpdated", Lang.bind(this, this._onLayoutUpdated));
         this._proxyMenu.connectSignal("ItemsPropertiesUpdated", Lang.bind(this, this._onPropertiesUpdated));
      }
   },

   _onLayoutUpdated: function(proxy, sender, items) {
       GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,
          Lang.bind(this, this._requestLayoutUpdate));
   },

   _onPropertiesUpdated: function(proxy, name, [changed, removed]) {
      if(this._items) {
         changed.forEach(function([id, properties]) {
            if(!(id in this._items))
               return;

            this._items[id].updatePropertiesAsVariant(properties);
         }, this);
         removed.forEach(function([id, propNames]) {
            if(!(id in this._items))
               return;

            let properties = {};            
            propNames.forEach(function(propName) {
               properties[propName] = null;
            }, this);
            this._items[id].updatePropertiesAsVariant(properties);
         }, this);
      }
   },

   destroy: function() {
      if(this._proxyMenu) {
         Signals._disconnectAll.apply(this._proxyMenu);
         this._proxyMenu = null;
         let root = this.getRoot();
         root.destroy();
         this._items = null;
      }
   }
};

function DBusClientGtk() {
   this._init.apply(this, arguments);
}

DBusClientGtk.prototype = {
   __proto__: DBusClient.prototype,

   _init: function(busName, busPath, windowPath, appPath) {
      DBusClient.prototype._init.call(this, busName, busPath);
      this._proxyUnityAction = null;
      this._proxyWindowAction = null;
      this._proxyAppAction = null;
      this._gtkMenubarMenus = null;
      this._windowPath = windowPath;
      this._appPath = appPath;

      //global.log("busName:" + busName +", busPath:"+ busPath +", windowPath:"+ windowPath +", appPath:"+ appPath);

      this._actionsIds = {};
      this._initMenu = [];
      for(let x = 0; x < 1024; x++)
         this._initMenu.push(x);
   },

   renderMetadata: function() {
      //return "";
      return this._busName + "," + this._busPath + "," + this._windowPath + "," + this._appPath;
   },

   getRootId: function() {
      return "00";
   },

   sendEvent: function(id, event, params, timestamp) {//FIXME no match signal id
      this._reportEvent(id, event, params, timestamp)
      if(event == ConfigurableMenus.FactoryEventTypes.opened) {
         this._sendAboutToShow(id);
         //this.fakeSendAboutToShow(id);
      }
   },

   _sendAboutToShow: function(id) {
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,
         Lang.bind(this, this._requestLayoutUpdate));
   },

   fakeSendAboutToShow: function(lastId) {
      /*if(this._items && (lastId in this._items)) {
         this._reportEvent(lastId, ConfigurableMenus.FactoryEventTypes.opened, null, 0);
         let listId = this._items[lastId].getChildrenIds();
         let id;
         for(let pos in listId) {
            id = listId[pos];
            if(this._items[id].getFactoryType() == ConfigurableMenus.FactoryClassTypes.MenuSectionMenuItemClass) {
               this.fakeSendAboutToShow(id);
            }
         }
      }*/
      // FakeSendAboutToShow is not requiered by gtkdbus menu,
      // all structure is always retrived, so is more slow if
      // call that.
   },

   _startMainProxy: function() {
      this._proxyMenu = new BusGtkClientProxy(Gio.DBus.session, this._busName, this._busPath,
         Lang.bind(this, this._clientReady));
   },

   _requestActionsUpdate: function(proxy, type) {
      if(proxy)
         proxy.DescribeAllRemote(Lang.bind(this, this._endActionsUpdate, type));
   },

   _endActionsUpdate: function(result, error, type) {//FIXME not all values are updated.
      if(error) {
         //global.log("While reading menu actions: " + error);
      } else if((result) && (result[0])) {
         let propertiesHash = result[0];
         let isNotCreate = false;

         for(let action in propertiesHash) {
            let actionId = type + "." + action;
            if((isNotCreate)&&(!(actionId in this._actionsIds))) {
               isNotCreate = true;
               this._createActionsIds();
            }
            let id = this._actionsIds[actionId];
            if(!this._items || !(id in this._items))
               continue;

            let properties = propertiesHash[action];
            this._items[id].setSensitive(properties[0]);
            if(properties[1])
               this._items[id].setParamType(GLib.Variant.new("g", properties[1]));
            else
               this._items[id].setParamType(GLib.Variant.new("g", ""));

            if((properties[2])&&(properties[2].length > 0)) {
               this._items[id].setToggleType('checkmark');
               let value = properties[2][0].deep_unpack();
               this._items[id].setToggleState((value ? 1 : 0));
            } else if(this._items[id].getToggleState()) {
               this._items[id].setToggleState(0);
            }
         }
      }
   },

   _createActionsIds: function() {
      if(this._items) {
         for(let id in this._items) {
            let actionId = this._items[id].getAction();
            if(actionId) {
               this._actionsIds[actionId] = id;
               this._createIconForActionId(id, actionId);
            }
         }
      }
   },

   _createIconForActionId: function(id, actionId) {
      if(this._items && (id in this._items)&&(!this._items[id].getGdkIcon())) {
         let action = actionId.replace("unity.", "").replace("win.", "").replace("app.", "");
         let gtkIconName = null;
         try {
            // FIXME we need to find a better way to get more standar gtk icons
            // using the gtk-action-id.
            let actionName = action.toLowerCase();
            if(IconTheme.has_icon(actionName)) {
               gtkIconName = actionName;
            } else if(IconTheme.has_icon("gtk-" + actionName)) {
               gtkIconName = "gtk-" + actionName;
            } else if(actionName.indexOf("replace") != -1) {
               gtkIconName = "gtk-find-and-replace";
            } else if((actionName.indexOf("select") != -1)&&(actionName.indexOf("all") != -1)) {
               gtkIconName = "gtk-select-all";
            } else if((actionName.indexOf("spell") != -1)&&(actionName.indexOf("check") != -1)) {
               gtkIconName = "gtk-spell-check";
            } else if((actionName.indexOf("-cut") != -1)||(actionName.indexOf("cut-") != -1)) {
               gtkIconName = "gtk-cut";
            } else if(actionName.indexOf("connect") != -1) {
               gtkIconName = "gtk-connect";
            } else if(actionName.indexOf("fullscreen") != -1) {
               gtkIconName = "gtk-fullscreen";
            } else if(actionName.indexOf("execute") != -1) {
               gtkIconName = "gtk-execute";
            } else if(actionName.indexOf("open") != -1) {
               gtkIconName = "gtk-open";
            } else if(actionName.indexOf("undo") != -1) {
               gtkIconName = "gtk-undo-ltr";
            } else if(actionName.indexOf("clear") != -1) {
               gtkIconName = "gtk-clear";
            } else if(actionName.indexOf("cancel") != -1) {
               gtkIconName = "gtk-cancel";
            } else if(actionName.indexOf("stop") != -1) {
               gtkIconName = "gtk-stop";
            } else if(actionName.indexOf("refresh") != -1) {
               gtkIconName = "gtk-refresh";
            } else if(actionName.indexOf("trash") != -1) {
               gtkIconName = "emptytrash";
            } else if(actionName.indexOf("redo") != -1) {
               gtkIconName = "gtk-redo-ltr";
            } else if(actionName.indexOf("properties") != -1) {
               gtkIconName = "gtk-properties";
            } else if(actionName.indexOf("preference") != -1) {
               gtkIconName = "gtk-preferences";
            } else if(actionName.indexOf("paste") != -1) {
               gtkIconName = "gtk-paste";
            } else if(actionName.indexOf("remove") != -1) {
               gtkIconName = "gtk-remove";
            } else if(actionName.indexOf("open") != -1) {
               gtkIconName = "gtk-open";
            } else if(actionName.indexOf("add") != -1) {
               gtkIconName = "gtk-add";
            } else if(actionName.indexOf("add") != -1) {
               gtkIconName = "gtk-add";
            } else if(actionName.indexOf("quit") != -1) {
               gtkIconName = "gtk-quit";
            } else if(actionName.indexOf("close") != -1) {
               gtkIconName = "gtk-close";
            } else if(actionName.indexOf("new") != -1) {
               gtkIconName = "gtk-new";
            } else if(actionName.indexOf("about") != -1) {
               gtkIconName = "gtk-about";
            } else if(actionName.indexOf("help") != -1) {
               gtkIconName = "gtk-help";
            } else if(actionName.indexOf("find") != -1) {
               gtkIconName = "gtk-find";
            } else if(actionName.indexOf("copy") != -1) {
               gtkIconName = "gtk-copy";
            } else if(actionName.indexOf("edit") != -1) {
               gtkIconName = "gtk-edit";
            } else if(actionName.indexOf("save") != -1) {
               if(actionName.indexOf("all") != -1) {
                  gtkIconName = "gtk-save-all", 25;
               } else {
                  gtkIconName = "gtk-save";
               }
            } else if(actionName.indexOf("print") != -1) {
               if(actionName.indexOf("preview") != -1) {
                  gtkIconName = "gtk-print-preview";
               } else {
                  gtkIconName = "gtk-print";
               }
            } else if(actionName.indexOf("zoom") != -1) {
               if(actionName.indexOf("out") != -1) {
                  gtkIconName = "gtk-zoom-out";
               } else {
                  gtkIconName = "gtk-zoom-in";
               }
            }
            if((gtkIconName)&&(IconTheme.has_icon(gtkIconName))) {
               let icon = IconTheme.load_icon(gtkIconName, 25, Gtk.IconLookupFlags.GENERIC_FALLBACK);
               this._items[id].setGdkIcon(icon);
            }
         } catch(e) {
            global.log("While reading icon for actions ids: " + e.message);
         }
      }
   },

   _requestLayoutUpdate: function() {
      if(this._flagLayoutUpdateInProgress) {
         this._flagLayoutUpdateRequired = true;
      } else {
         this._beginLayoutUpdate();
      }
   },

   // FIXME Call End over the Cinnamon restart, will crash some Gtk applications.
   // This is because we need to call End the same number of times that we call Start,
   // and this can not be a waranty is Cinnamon destroy the object on the middle of
   // the process. So, we can call End when we call Start, but possible we not recive
   // some changes on the menu structure during the life of the Gtk applications or a
   // Cinnamon restart, but we don't like a glib-gio error with a corresponding core dump
   // for the Gtk applications.
   // GLib-GIO:ERROR: g_menu_exporter_group_unsubscribe: assertion failed:
   // (group->subscribed >= count)
   _beginLayoutUpdate: function() {
      this._flagLayoutUpdateRequired = false;
      if(this._proxyMenu) {
         this._flagLayoutUpdateInProgress = true;
         this._proxyMenu.StartRemote(this._initMenu, Lang.bind(this, this._endLayoutUpdate));
         this._proxyMenu.EndRemote(this._initMenu, Lang.bind(this, function(result, error) {})); // Nothing to do
      }
   },

   _endLayoutUpdate: function(result, error) {
      if(error) {
         global.log("While reading menu layout: " + error);
         return;
      }
      // Now unpack the menu and create our items
      if((result) && (result[0])) {
         let initId = this.getRootId();
         this._gtkMenubarMenus = {};
         this._gtkMenubarMenus[initId] = [];
         let menuData = result[0];
         // We really don't know where is our root items but, we supposed that
         // the items have an order and our root item need to have at less
         // a label in the first position, so try to find the first match.
         let realInit = false;
         for(let pos in menuData) {
            let [menuPos, sectionPos, sectionItems] = menuData[pos];
            if(!realInit) {
               if((sectionItems.length > 0) && ("label" in sectionItems[0])) {
                  this._gtkMenubarMenus[initId] = sectionItems;
                  realInit = true;
               }
            } else {
               this._gtkMenubarMenus["" + menuPos +""+ sectionPos] = sectionItems;
            }
         }
         this._doLayoutUpdate(initId, { "children-display": GLib.Variant.new_string("rootmenu"), 'visible': GLib.Variant.new_boolean(false) } );

         this._requestActionsUpdate(this._proxyUnityAction, "unity");
         this._requestActionsUpdate(this._proxyWindowAction, "win");
         this._requestActionsUpdate(this._proxyAppAction, "app");

         this._gcItems();
         this._createActionsIds();
      }

      if(this._flagLayoutUpdateRequired) {
         this._beginLayoutUpdate();
      } else {
         this._flagLayoutUpdateInProgress = false;
      }
   },

   _doLayoutUpdate: function(id, properties) {
      try {
         let childrenIds = [];
         let menuSection, idSub, newPos;
         if(id in this._gtkMenubarMenus) {
            let item = this._gtkMenubarMenus[id];
            for(let pos in item) {
               menuSection = item[pos];
               menuSection["type"] = GLib.Variant.new_string("standard");
               if(":section" in menuSection) {
                  newPos = menuSection[":section"].deep_unpack();
                  idSub = "" + newPos[0] +""+ newPos[1];
                  childrenIds.push(idSub);
                  menuSection["children-display"] = GLib.Variant.new_string("section");
                  this._doLayoutUpdate(idSub, menuSection);
               }
               else if(":submenu" in menuSection) {
                  newPos = menuSection[":submenu"].deep_unpack();
                  idSub = "" + newPos[0] +""+ newPos[1];
                  childrenIds.push(idSub);
                  menuSection["children-display"] = GLib.Variant.new_string("submenu");
                  this._doLayoutUpdate(idSub, menuSection);
               } else {
                  // FIXME Aparently we can not used the label of the item here 
                  // to identify an item. Could be found a better id to handle this?
                  // The label would not exsist (xchat example). The position is
                  // not a good one aparently. So, we use a convination of both.
                  if("label" in menuSection)
                     idSub = "" + id + "" + menuSection["label"].unpack();
                  else
                     idSub = "" + id + "" + pos;
                  if(childrenIds.indexOf(idSub) == -1) { 
                     childrenIds.push(idSub);
                     this._doLayoutUpdate(idSub, menuSection);
                  }
               }
            }
         }

         if(this._items && (id in this._items)) {
            // We do, update our properties if necessary
            this._items[id].updatePropertiesAsVariant(properties);

            // Make sure our children are all at the right place, and exist
            let oldChildrenIds = this._items[id].getChildrenIds();
            for(let i = 0; i < childrenIds.length; ++i) {
               // Try to recycle an old child
               let oldChild = -1;
               for(let j = 0; j < oldChildrenIds.length; ++j) {
                  if(oldChildrenIds[j] === childrenIds[i]) {
                     oldChild = oldChildrenIds.splice(j, 1)[0];
                     break;
                  }
               }

               if(oldChild < 0) {
                  // No old child found, so create a new one!
                  this._items[id].addChild(i, childrenIds[i]);
               } else {
                  // Old child found, reuse it!
                  this._items[id].moveChild(childrenIds[i], i);
               }
            }

             // Remove any old children that weren't reused
            oldChildrenIds.forEach(function(childId) { 
               this._items[id].removeChild(childId); 
            }, this);
         } else if(this._items) {
            // We don't, so let's create us 
            this._items[id] = new DbusMenuItem(id, childrenIds, properties, this);
            //this._requestProperties(id);
         }
      } catch (e) {
         global.log("Error: " + e.message);
      }
      return id;
   },

   _reportEvent: function(id, event, params, timestamp) {
      if(this._items && (event == ConfigurableMenus.FactoryEventTypes.clicked)) {
         let actionId = this._items[id].getAction();
         let proxy = this._findProxyForActionType(actionId);
         if(proxy) {
            let plataform = {};
            if(!params)
               params = this._items[id].getParamType();
            if(!params) 
               params = GLib.Variant.new("av", []);
            let action = actionId.replace("unity.", "").replace("win.", "").replace("app.", "");
            proxy.ActivateRemote(action, params, plataform,
               function(result, error) {}); // We don't care
         }
      }
   },

   _findProxyForActionType: function(actionId) {
      if(actionId.indexOf("unity") == 0) {
         return this._proxyUnityAction;
      } else if(actionId.indexOf("win") == 0) {
         return this._proxyWindowAction;
      } else if(actionId.indexOf("app") == 0) {
         return this._proxyAppAction;
      }
      return null;
   },

   _onLayoutUpdated: function() {
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,
            Lang.bind(this, this._requestLayoutUpdate));
   },

   _onActionsUpdated: function(proxy, sender, data, type) {
      this._requestActionsUpdate(proxy, type);
   },

   _clientReady: function(result, error) {
      if(error) {
         //FIXME: show message to the user?
         global.log("Could not initialize menu proxy: " + error);
         return;
      }

      this._requestLayoutUpdate();
      // Listen for updated layouts and actions
      if(this._proxyMenu)
         this._proxyMenu.connectSignal("Changed", Lang.bind(this, this._onLayoutUpdated));
      if(this._busPath)
         this._proxyUnityAction = new ActionsGtkClientProxy(Gio.DBus.session, this._busName, this._busPath,
            Lang.bind(this, this._clientActionReady, "unity"));
      if(this._windowPath)
         this._proxyWindowAction = new ActionsGtkClientProxy(Gio.DBus.session, this._busName, this._windowPath,
            Lang.bind(this, this._clientActionReady, "win"));
      if(this._appPath)
         this._proxyAppAction = new ActionsGtkClientProxy(Gio.DBus.session, this._busName, this._appPath,
            Lang.bind(this, this._clientActionReady, "app"));
   },

   _clientActionReady: function(result, error, type) {
      if(error) {
         //FIXME: show message to the user?
         global.log("Could not initialize menu proxy: " + error);
         return;
      }
      if((type == "unity") && this._proxyUnityAction) {
         this._requestActionsUpdate(this._proxyUnityAction, type);
         this._proxyUnityAction.connectSignal("Changed", Lang.bind(this, this._onActionsUpdated, type));
      } else if((type == "win") && this._requestActionsUpdate) {
         this._requestActionsUpdate(this._proxyWindowAction, type);
         this._proxyWindowAction.connectSignal("Changed", Lang.bind(this, this._onActionsUpdated, type));
      } else if((type == "app") && this._proxyAppAction) {
         this._requestActionsUpdate(this._proxyAppAction, type);
         this._proxyAppAction.connectSignal("Changed", Lang.bind(this, this._onActionsUpdated, type));
      }
   },

   destroy: function() {
      if(this._proxyMenu) {
         DBusClient.prototype.destroy.call(this);
         this._proxyMenu = null;
      }
      if(this._proxyUnityAction) {
         Signals._disconnectAll.apply(this._proxyUnityAction);
         this._proxyUnityAction = null;
      }
      if(this._proxyWindowAction) {
         Signals._disconnectAll.apply(this._proxyWindowAction);
         this._proxyWindowAction = null;
      }
      if(this._proxyAppAction) {
         Signals._disconnectAll.apply(this._proxyAppAction);
         this._proxyAppAction = null;
      }
   }
};
