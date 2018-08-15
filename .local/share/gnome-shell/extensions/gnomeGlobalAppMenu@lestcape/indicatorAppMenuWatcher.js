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
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
// MA  02110-1301, USA.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;
const Meta = imports.gi.Meta;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const GIRepository = imports.gi.GIRepository;

const Lang = imports.lang;
const Signals = imports.signals;

const Main = imports.ui.main;
const Util = imports.misc.util;


const MyExtension = imports.misc.extensionUtils.getCurrentExtension();
const DBusMenu = MyExtension.imports.dbusMenu;
const DBusRegistrar = DBusMenu.loadInterfaceXml("DBusRegistrar.xml");

const FILE_PATH = MyExtension.dir.get_path();

const WATCHER_INTERFACE = 'com.canonical.AppMenu.Registrar';
const WATCHER_OBJECT = '/com/canonical/AppMenu/Registrar';

const AppmenuMode = {
   MODE_STANDARD: 0,
   MODE_UNITY: 1,
   MODE_UNITY_ALL_MENUS: 2
};

const LOG_NAME = "Indicator AppMenu Whatcher:";

//Some GTK APP that use Register iface or not export the menu.
const GTK_BLACKLIST = [
   "firefox.desktop",
   "thunderbird.desktop",
   "blender-fullscreen.desktop",
   "blender-windowed.desktop"
];

function SystemProperties() {
   this._init.apply(this, arguments);
}

SystemProperties.prototype = {

   _init: function() {
      this._environmentCallback = null;
      let strSchema = 'org.gnome.settings-daemon.plugins.xsettings';
      this.xSetting = new Gio.Settings({ schema: strSchema });
      this._gtkSettings = Gtk.Settings.get_default();
      /*this._showsMenuBarId = this._gtkSettings.connect('notify::gtk-shell-shows-menubar',
      Lang.bind(this, function() {
         let values = this.xSetting.get_value('overrides').deep_unpack();
         if('Gtk/ShellShowsMenubar' in values) {
            let val = values['Gtk/ShellShowsMenubar'].deep_unpack();
            if (val == 0) {
               this.shellShowMenubar(true);
            }
         }
      }));*/
      this.backend = this._getPreferendBackend();
   },

   _getGtkModulesDir: function() {
      let repo = GIRepository.Repository.get_default();
      let gtkPath = repo.get_typelib_path("Gtk");
      if (gtkPath && gtkPath.indexOf(".typelib") != -1) {
         let file = Gio.file_new_for_path(gtkPath);
         file = file.get_parent().get_parent().get_child('gtk-3.0');
         file = file.get_child('modules');
         if (file.query_exists(null))
            return file;
         // Well if our aproach fail try to get it using ldconfig
         let cmd = "ldconfig -p";// grep libgtk-3.so.0
         let [ok, standard_output, standard_error, exit_status] =
            GLib.spawn_command_line_sync(cmd);
         if(ok && (exit_status == 0)) {
            let list = standard_output.toString().split("\n");
            for (let pos in list) {
               if (list[pos].indexOf("/libgtk-3.so.0") != -1) {
                  let start = list[pos].indexOf("=>");
                  let end = list[pos].indexOf("/libgtk-3.so.0");
                  let s = list[pos].substring(start + 3, end);
                  file = Gio.file_new_for_path(s);
                  file = file.get_child('gtk-3.0').get_child('modules');
                  if (file.query_exists(null))
                     return file;
               }
            }
         }
      }
      return null;
   },

   // We now have a unity-gtk-module and the appmenu-gtk-module fork.
   // As the first seen to be discontinued and more like an specific desktop
   // implementation we will always prefer the appmenu-gtk-module fork.
   _getPreferendBackend: function() {
      let prefered = "appmenu-gtk-module";
      let modules = this._getGtkModulesDir();
      if (modules) {
         let moduleFile = modules.get_child('libappmenu-gtk-module.so');
         if (!moduleFile.query_exists(null)) {
            moduleFile = modules.get_child('libunity-gtk-module.so');
            if (moduleFile.query_exists(null)) {
               prefered = "unity-gtk-module";
            }
         }
      }
      return prefered;
   },

   getBackend: function() {
       return this.backend;
   },

   getBackendMenuProxy: function() {
       if (this.backend == "unity-gtk-module") {
           return "UBUNTU_MENUPROXY";
       }
       return "UBUNTU_MENUPROXY"; ///"appmenu-gtk-module";
   },

   shellShowAppmenu: function(show) {
      this._overrideBoolXSetting('Gtk/ShellShowsAppMenu', show);
      this._gtkSettings.gtk_shell_shows_app_menu = show;
   },

   shellShowMenubar: function(show) {
      this._overrideBoolXSetting('Gtk/ShellShowsMenubar', show);
      this._gtkSettings.gtk_shell_shows_menubar = show;
   },

   activeJAyantanaModule: function(active) {
      if(active) {
         let file = Gio.file_new_for_path("/usr/share/java/jayatanaag.jar");
         if(file.query_exists(null)) {
             let envJavaToolOptions = this._getEnvJavaToolOptions();
             GLib.setenv('JAYATANA', "1", true);
             GLib.setenv('JAYATANA_FORCE', "1", true);
             let jayantana = "-javaagent:/usr/share/java/jayatanaag.jar";
             if(envJavaToolOptions.indexOf(jayantana) == -1) {
                 envJavaToolOptions.push(jayantana);
             }
             GLib.setenv('JAVA_TOOL_OPTIONS', envJavaToolOptions.join(" "), true);
          }
      } else {
          GLib.setenv('JAYATANA', "0", true);
          GLib.setenv('JAYATANA_FORCE', "0", true);
          let envJavaToolOptions = this._getEnvJavaToolOptions();
          let jayantana = "-javaagent:/usr/share/java/jayatanaag.jar";
          let index = envJavaToolOptions.indexOf(jayantana);
          if(index != -1) {
             envJavaToolOptions.splice(index, -1);
          }
          GLib.setenv('JAVA_TOOL_OPTIONS', envJavaToolOptions.join(" "), true);
      }
   },

   activeBackendGtkModule: function(active) {
      let isReady = false;
      let envGtk = this._getEnvGtkModules();
      let xSettingGtk = this._getXSettingGtkModules();
      let gtkModules = this._gtkSettings.gtk_modules;
      if(active) {
         if(envGtk) {
            if(envGtk.indexOf(this.backend) == -1) {
               envGtk.push(this.backend);
               this._setEnvGtkModules(envGtk);
            } else {
               isReady = true;
            }
         } else  {
            envGtk = [this.backend];
            this._setEnvGtkModules(envGtk);
         }
         if(xSettingGtk) {
            if(xSettingGtk.indexOf(this.backend) == -1) {
               xSettingGtk.push(this.backend);
               this._setXSettingGtkModules(xSettingGtk);
            } else {
               isReady = true;
            }
         } else  {
            xSettingGtk = [this.backend];
            this._setXSettingGtkModules(xSettingGtk);
         }
         if(!gtkModules) {
             this._gtkSettings.gtk_modules = this.backend;
         } else if(gtkModules.indexOf(this.backend) == -1) {
            this._gtkSettings.gtk_modules += ":" + this.backend;
         } else {
            isReady = true;
         }
      } else {
         if(envGtk) {
            let pos = envGtk.indexOf(this.backend);
            if(pos != -1) {
               envGtk.splice(pos, 1);
               this._setEnvGtkModules(envGtk);
            } else {
               isReady = true;
            }
         }
         if(xSettingGtk) {
            let pos = xSettingGtk.indexOf(this.backend);
            if(pos != -1) {
               xSettingGtk.splice(pos, 1);
               this._setXSettingGtkModules(xSettingGtk);
            } else {
               isReady = true;
            }
         } else  {
            isReady = true;
         }
         if(gtkModules) {
            let modules = gtkModules.split(":");
            let index = modules.indexOf(this.backend);
            if(index != -1) {
                modules.splice(index, 1);
                this._gtkSettings.gtk_modules = modules.join(":");
            } else {
               isReady = true;
            }
         }
      }
      return isReady;
   },

   activeQtPlatform: function(active) {
      let envMenuProxy = GLib.getenv('QT_QPA_PLATFORMTHEME');
      let haveEnv = (envMenuProxy && (envMenuProxy.indexOf("appmenu") != -1));
      if(active && !haveEnv) {
         GLib.setenv('QT_QPA_PLATFORMTHEME', "appmenu-qt5", true);
         return true;
      } else if(!active && haveEnv) {
         GLib.setenv('QT_QPA_PLATFORMTHEME', "qgnomeplatform", true);
         return true;
      }
      return false;
   },

   activeBackendMenuProxy: function(active) {
      let menuProxy = this.getBackendMenuProxy();
      let envMenuProxy = GLib.getenv(menuProxy);
      if(active && (envMenuProxy != "1")) {
         GLib.setenv(menuProxy, "1", true);
         return false;
      } else if(!active && envMenuProxy == "1") {
         GLib.setenv(menuProxy, "0", true);
      }
      return true;
   },

   setEnvironmentVar: function(show, callback) {
      this._environmentCallback = callback;
      let destFile = Gio.file_new_for_path(FILE_PATH);
      destFile = destFile.get_child('utils').get_child('environment.js');
      if(show && !this.isEnvironmentSet()) {
         this._changeModeGFile(destFile, 755);
         Util.spawn([destFile.get_path(), '-i'],
            Lang.bind(this, this._onEnvironmentChanged));
      } else if(!show && this.isEnvironmentSet()) {
         this._changeModeGFile(destFile, 755);
         Util.spawn([destFile.get_path(), '-u'],
            Lang.bind(this, this._onEnvironmentChanged));
      }
   },

   isEnvironmentSet: function() {
      let path = "/etc/profile.d/proxy-globalmenu.sh";
      let file = Gio.file_new_for_path(path);
      return file.query_exists(null);
   },

   _onEnvironmentChanged: function(result) {
      let out = result.split(/\n/);
      if((out.length == 2) && 
         ((out[out.length-2] == "true") || (out[out.length-2] == "false"))) {
         if(this._environmentCallback) {
            this._environmentCallback(this.isEnvironmentSet(),
               out[out.length-2] == "false");
         }
      } else {
         if(this._environmentCallback) {
             this._environmentCallback(this.isEnvironmentSet(), true);
         }
      }
   },

   _changeModeGFile: function(file, octal) {
      if(file.query_exists(null)) {
         let info = file.query_info("unix::mode", Gio.FileQueryInfoFlags.NONE, null);
         info.set_attribute_uint32("unix::mode", parseInt(octal, 8));
         file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
      }
   },

   _overrideBoolXSetting: function(xsetting, show) {
      let values = this.xSetting.get_value('overrides').deep_unpack();
      if(show) {
         if(xsetting in values) {
            let status = values[xsetting]
            if(status != 1) {
               values[xsetting] = GLib.Variant.new('i', 1);
               let returnValue = GLib.Variant.new('a{sv}', values);
               this.xSetting.set_value('overrides', returnValue);
               Gio.Settings.sync ()
            }
         } else {
            values[xsetting] = GLib.Variant.new('i', 1);
            let returnValue = GLib.Variant.new('a{sv}', values);
            this.xSetting.set_value('overrides', returnValue);
            Gio.Settings.sync ()
         }
      } else if(xsetting in values) {
         let status = values[xsetting];
         if(status != 0) {
            values[xsetting] = GLib.Variant.new('i', 0); 
            let returnValue = GLib.Variant.new('a{sv}', values);
            this.xSetting.set_value('overrides', returnValue);
            Gio.Settings.sync ()
         }
      }
   },

   _getEnvJavaToolOptions: function() {
      let result = [];
      let env = GLib.getenv('JAVA_TOOL_OPTIONS');
      if(env && env != "") {
         let arrayOptions = env.split(" ");
         for(let pos in arrayOptions) {
            let option = arrayOptions[pos];
            if(option && option != "") {
                result.push(option);
            }
         }
      }
      return result;
   },

   _getEnvGtkModules: function() {
      let envGtk = GLib.getenv('GTK_MODULES');
      if(envGtk)
         return envGtk.split(":");
      return null;
   },

   _setEnvGtkModules: function(envGtkList) {
      GLib.setenv('GTK_MODULES', envGtkList.join(":"), true);
   },

   _getXSettingGtkModules: function() {
      return this.xSetting.get_strv('enabled-gtk-modules');
   },

   _setXSettingGtkModules: function(envGtkList) {
      this.xSetting.set_strv('enabled-gtk-modules', envGtkList);
   },

   _readFile: function(path) {
      try {
         let file = Gio.file_new_for_path(path);
         if(file.query_exists(null)) {
            let fstream = file.read(null);
            let dstream = new Gio.DataInputStream({ base_stream: fstream });
            let data = dstream.read_until("", null);
            fstream.close(null);
            return data.toString();
         }
      } catch(e) {
         global.logError("Error:" + e.message);
      }
      return null;
   }
};

/*
 * The X11RegisterMenuWatcher class implements
 * the cannonical registrar dbus Interface.
 * Here will need to encapsulate things to
 * handled the windows xid mechanims.
 */
function X11RegisterMenuWatcher() {
   this._init.apply(this, arguments);
}

X11RegisterMenuWatcher.prototype = {
   _init: function() {
      this._registeredWindows = {};
      this._ownName = null;
      this._ownNameId = null;
      this._appSysId = 0;
      this._windowsChangedId = 0;
      this._cancellable = new Gio.Cancellable;
      this._tracker = Shell.WindowTracker.get_default();
      this._appSys = Shell.AppSystem.get_default();
      this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(DBusRegistrar, this);
   },

   // Private functions
   _acquiredName: function(connection, name) {
      this._ownName = name;
      global.log("X11Menu Whatcher: Acquired name %s".format(WATCHER_INTERFACE));
      
   },

   _lostName: function(connection, name) {
      if(this._ownName) {
         global.log("X11Menu Whatcher: Lost name %s".format(WATCHER_INTERFACE));
      } else {
         global.log("X11Menu Whatcher: Failed to acquire %s".format(WATCHER_INTERFACE));
      }
      this._ownName = null;
   },

   watch: function() {
      if(!this._ownName) {
         this._dbusImpl.export(Gio.DBus.session, WATCHER_OBJECT);
         this._ownNameId = Gio.DBus.session.own_name(
            WATCHER_INTERFACE,
            Gio.BusNameOwnerFlags.NONE,
            Lang.bind(this, this._acquiredName),
            Lang.bind(this, this._lostName)
         );
         if(this._appSysId == 0) {
            this._appSysId = this._appSys.connect('app-state-changed',
               Lang.bind(this, this._onAppMenuNotify));
         }
         if(this._windowsChangedId == 0) {
            this._windowsChangedId = this._tracker.connect('tracked-windows-changed',
               Lang.bind(this, this._updateWindowList));
         }
         this._updateWindowList();
      }
   },

   getType: function() {
      return "X11RegisterMenuWatcher";
   },

   renderMetadata: function() {
      let result = "";
      for (let xid in this._registeredWindows) {
          if (this._registeredWindows[xid].appMenu) {
              result += xid + "-" + this.getType() + ",";
              result += this._registeredWindows[xid].appMenu.renderMetadata() + ";";
          }
      }
      return result;
   },

   createFromArray: function(xid, arr) {
      if ((arr.length == 3) && (arr[0] === this.getType())) {
         let senderDbus = arr[1];
         let menubarPath = arr[2];
         this._registerWindowXId(xid, menubarPath, senderDbus);
      }
   },

   _onAppMenuNotify: function(appSys, targetAppSys) {
      let isBusy = (targetAppSys != null &&
                   (targetAppSys.get_state() == Shell.AppState.STARTING ||
                    targetAppSys.get_busy()));
      if (!isBusy) {
         let windows = this._findWindowForApp(targetAppSys);
         for(let pos in windows) {
            let xid = windows[pos];
            let windData = this._registeredWindows[xid];
            if (windData.window && !windData.appMenu) {
               this._tryToGetMenuClient(xid);
            }
         }
      }
   },

   _findWindowForApp: function(targetAppSys) {
      let windows = [];
      let id = targetAppSys.get_id();
      for(let xid in this._registeredWindows) {
         let currentWindow = this._registeredWindows[xid].window;
         if(currentWindow) {
             let currentTracker = this._tracker.get_window_app(currentWindow);
             if (currentTracker && (id == currentTracker.get_id())) {
                 windows.push(xid);
             }
         }
      }
      return windows;
   },

   isWatching: function() {
      return (this._ownName != null);
   },

   getMenuForWindow: function(window) {
      let xid = this._guessWindowXId(window);
      if(xid && (xid in this._registeredWindows)) {
         return this._registeredWindows[xid].appMenu;
      }
      return null;
   },

   updateMenuForWindow: function(window) {
      let xid = this._guessWindowXId(window);
      if(xid && (xid in this._registeredWindows)) {
         let appmenu = this._registeredWindows[xid].appMenu;
         if(appmenu) {
            appmenu.fakeSendAboutToShow(appmenu.getRootId());
            return true;
         }
      }
      return false;
   },

   // DBus Functions
   RegisterWindowAsync: function(params, invocation) {
      let wind = null;
      let [xid, menubarObjectPath] = params;
      let sender = invocation.get_sender();
      this._registerWindowXId(xid, menubarObjectPath, sender);
      let gWin = GLib.Variant.new('(uso)', [xid, sender, menubarObjectPath]);
      this._dbusImpl.emit_signal('WindowRegistered', gWin);
      let msg = "X11Menu Whatcher: RegisterWindow %d %s %s";
      global.log(msg.format(xid, sender, menubarObjectPath));
      // Return a value Firefox and Thunderbird are waiting for it.
      invocation.return_value(new GLib.Variant('()', []));
   },

   UnregisterWindowAsync: function(params, invocation) {
      let [xid] = params;
      if (xid && (xid in this._registeredWindows) && this.isWatching()) {
         this._destroyMenu(xid);
         this._emitWindowUnregistered(xid);
      }
      invocation.return_value(new GLib.Variant('()', []));
   },

   _emitWindowUnregistered: function(xid) {
      if((xid) && this.isWatching()) {
         this._dbusImpl.emit_signal('WindowUnregistered', GLib.Variant.new('(u)', [xid]));
         global.log("X11Menu Whatcher: UnregisterWindow %d".format(xid));
      }
   },

   GetMenuForWindowAsync: function(params, invocation) {
      let [xid] = params;
      let retval;
      if(xid in this._registeredWindows) {
         retval = GLib.Variant.new('(so)', [
            this._registeredWindows[xid].sender,
            this._registeredWindows[xid].menubarObjectPath
         ]);
      } else {
         retval = [];
      }
      invocation.return_value(retval);
   },

   GetMenusAsync: function(params, invocation) {
      let result = [];
      for(let xid in this._registeredWindows) {
         result.push([
            xid, this._registeredWindows[xid].sender,
            this._registeredWindows[xid].menubarObjectPath
         ]);
      }
      let retval = GLib.Variant.new('(a(uso))', result);
      invocation.return_value(retval);
   },

   _updateWindowList: function() {
      let current = global.get_window_actors();
      let metaWindows = new Array();
      for (let pos in current) {
         let xid = this._guessWindowXId(current[pos].meta_window);
         if(xid) {
            if(xid in this._registeredWindows) {
               this._registeredWindows[xid].window = current[pos].meta_window;
               this._tryToGetMenuClient(xid);
            }
            metaWindows.push(xid);
         }
      }
      // PLEASE NOTE: Remove the register xid is not possible,
      // because the window tracker remove the window in a
      /*if (this.isWatching()) {
         for (let xid in this._registeredWindows) {
            if(metaWindows.indexOf(xid) == -1) {
               this._unregisterWindows(xid);
            }
         }
      }*/
   },

   _unregisterWindows: function(xid) {
      if(xid in this._registeredWindows) {
         this._destroyMenu(xid);
         delete this._registeredWindows[xid];
         this._emitWindowUnregistered(xid);
      }
   },

   _onMenuClientReady: function(xid, client) {
      if((xid in this._registeredWindows) && (client != null)) {
         this._registeredWindows[xid].appMenu = client;
         let root = client.getRoot();
         root.connectAndRemoveOnDestroy({
            'childs-empty'   : Lang.bind(this, this._onMenuEmpty, xid),
            'destroy'        : Lang.bind(this, this._onMenuDestroy, xid)
         });
         if(this.isWatching()) {
            this.emit('providers-changed');
            this.emit('client-menu-changed', this._registeredWindows[xid].appMenu);
         }
      }
   },

   _onMenuEmpty: function(root, xid) {
      // We don't have alternatives now, so destroy the appmenu?
      // this._onMenuDestroy(root, xid);
   },

   _onMenuDestroy: function(root, xid) {
      this._destroyMenu(xid);
   },

   _destroyMenu: function(xid) {
      if((xid) && (xid in this._registeredWindows)) {
         if(this.isWatching()) {
            this.emit('client-menu-changed', null);
         }
         if(this._registeredWindows[xid].appMenu) {
            this._registeredWindows[xid].appMenu.destroy();
            this._registeredWindows[xid].appMenu = null;
         }
      }
   },

   // Async because we may need to check the presence of a menubar object
   // as well as the creation is async.
   _getMenuClient: function(xid, callback) {
      if(xid in this._registeredWindows) {
         let sender = this._registeredWindows[xid].sender;
         let menubarPath = this._registeredWindows[xid].menubarObjectPath;
         let appMenu = this._registeredWindows[xid].appMenu;
         if(sender && menubarPath && !appMenu) {
            this._validateMenu(sender, menubarPath,
            Lang.bind(this, function(result, name, menubarPath) {
               if(result) {
                  let msg = "X11Menu Whatcher: Creating menu on %s, %s";
                  global.log(msg.format(sender, menubarPath));
                  callback(xid, new DBusMenu.DBusClient(name, menubarPath));
               } else {
                  callback(xid, null);
               }
            }));
         } else {
            callback(xid, null);
         }
      } else {
         callback(xid, null);
      }
   },

   _tryToGetMenuClient: function(xid) {
      if((xid in this._registeredWindows) && (!this._registeredWindows[xid].appMenu)) {
         if((this._registeredWindows[xid].menubarObjectPath) &&
            (this._registeredWindows[xid].sender)) {
            if (!this._isXIdBusy(xid)) {
               this._getMenuClient(xid, Lang.bind(this, this._onMenuClientReady));
            }
         } else {
            this._registeredWindows[xid].fail = true;
         }
      }  
   },

   _validateMenu: function(bus, path, callback) {
      Gio.DBus.session.call(
         bus, path, "org.freedesktop.DBus.Properties", "Get",
         GLib.Variant.new("(ss)", ["com.canonical.dbusmenu", "Version"]),
         GLib.VariantType.new("(v)"), Gio.DBusCallFlags.NONE, -1, null, function(conn, result) {
            try {
               var val = conn.call_finish(result);
            } catch (e) {
               global.log("X11Menu Whatcher: Invalid menu. %s".format(e));
               return callback(false);
            }
            var version = val.deep_unpack()[0].deep_unpack();
            // FIXME: what do we implement?
            if(version >= 2) {
               return callback(true, bus, path);
            } else {
               global.log("X11Menu Whatcher: Incompatible dbusmenu version %s".format(version));
               return callback(false);
            }
         }
      );
   },

   _isXIdBusy: function(xid) {
       let isBusy = true;
       if (xid in this._registeredWindows) {
         let window = this._registeredWindows[xid].window;
         if (window) {
            let appTracker = this._tracker.get_window_app(window);
            if (appTracker) {
               let appSys = this._appSys.lookup_app(appTracker.get_id());
               isBusy = (appSys != null &&
                        (appSys.get_state() == Shell.AppState.STARTING ||
                         appSys.get_busy()));
            }

         }
      }
      return isBusy;
   },

   _busNameAppeared: function(proxy, bus_name, nameOwner, xid) {
      global.log("X11Menu Whatcher: Bus Name Appeared: " + bus_name + " from xid " + xid);
   },

   _busNameVanished: function(proxy, bus_name, xid) {
      global.log("X11Menu Whatcher: Bus Name Vanished: " + bus_name + " from xid " + xid);
      this.emit('providers-changed');
   },

   _isDbusPresent: function(xid, sender, busPath) {
      let connection = Gio.bus_get_sync(Gio.BusType.SESSION, null);
      if (connection) {
         let ret = connection.call_sync(
            "org.freedesktop.DBus", "/org/freedesktop/DBus",
            "org.freedesktop.DBus", "ListNames", null,
            GLib.VariantType.new("(as)"), Gio.DBusCallFlags.NONE,
            -1, null
         ).deep_unpack();
         if (ret && ret[0]) {
            return true; //((ret[0].indexOf(sender) > -1) && (ret[0].indexOf(busPath) > -1));
         }
      }
      return false;
   },

   _nameUnwatchXid: function(xid) {
      if((xid in this._registeredWindows) &&
         this._registeredWindows[xid].nameWatcherId) {
         let nwId = this._registeredWindows[xid].nameWatcherId;
         Gio.DBus.session.unwatch_name(nwId);
         this._registeredWindows[xid].nameWatcherId = null;
      }
   },

   _registerWindowXId: function(xid, menubarPath, senderDbus) {
      let nameWatcherId = Gio.DBus.session.watch_name(
          senderDbus, Gio.BusNameWatcherFlags.NONE,
          Lang.bind(this, this._busNameAppeared, xid),
          Lang.bind(this, this._busNameVanished, xid)
      );
      if(!(xid in this._registeredWindows)) {
         this._registeredWindows[xid] = {
            sender: senderDbus,
            menubarObjectPath: menubarPath,
            nameWatcherId: nameWatcherId,
            window: null,
            appMenu: null,
            fail: false
         };
      } else {
         this._destroyMenu(xid);
         this._nameUnwatchXid(xid);
         this._registeredWindows[xid].sender = senderDbus;
         this._registeredWindows[xid].menubarObjectPath = menubarPath;
         this._registeredWindows[xid].nameWatcherId = nameWatcherId;
         this._registeredWindows[xid].window = null;
         this._registeredWindows[xid].appMenu = null;
         this._registeredWindows[xid].fail = false;
      }
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, Lang.bind(this, function(xid) {
         this._updateWindowList();
         /*if ((!this._registeredWindows[xid].appMenu) && (!this._isXIdBusy(xid))) {
             this._tryToGetMenuClient(xid);
         }*/
      }, xid));
   },

   // NOTE: we prefer to use the window's XID but this is not stored
   // anywhere but in the window's description being [XID (%10s window title)].
   // And I'm not sure I want to rely on that being the case always.
   // (mutter/src/core/window-props.c)
   //
   // If we use the windows' title, `xprop` grabs the "least-focussed" window
   // (bottom of stack I suppose).
   //
   // Can match winow.get_startup_id() to WM_WINDOW_ROLE(STRING)
   // If they're not equal, then try the XID?
   _guessWindowXId: function (wind) {
      if(!wind)
         return null;
      if(wind.get_xwindow)
         return wind.get_xwindow().toString();
      // If window title has non-utf8 characters, get_description() complains.
      // "Failed to convert UTF-8 string to JS string...",
      // event though get_title() works.
      let id = null;
      try {
         id = wind.get_description().match(/0x[0-9a-f]+/);
         if(id) {
            return parseInt(id[0], 16).toString();
         }
      } catch(err) {
      }
      // Use xwininfo, take first child.
      let act = wind.get_compositor_private();
      if(act && act['x-window']) {
         let cmd = 'xwininfo -children -id 0x%x'.format(act['x-window']);
         id = GLib.spawn_command_line_sync(cmd);
         if(id[0]) {
            let str = id[1].toString();

            // The X ID of the window is the one preceding the target
            // window's title. This is to handle cases where the window
            // has no frame and so act['x-window'] is actually the X ID
            // we want, not the child.
            let regexp = new RegExp('(0x[0-9a-f]+) +"%s"'.format(wind.title));
            id = str.match(regexp);
            if(id) {
               return parseInt(id[1], 16).toString();
            }

            // Otherwise, just grab the child and hope for the best
            id = str.split(/child(?:ren)?:/)[1].match(/0x[0-9a-f]+/);
            if(id) {
               return parseInt(id[0], 16).toString();
            }
         }
      }
      // FIXME: Debugging for when people find bugs or not? In Wayland
      // there are not souch thing like XID...
      // let msg = "Could not find XID for window with title %s";
      // global.logError("X11Menu Whatcher: " + msg.format(wind.title));
      return null;
   },

   destroy: function() {
      if(this._registeredWindows) {
         // This doesn't do any sync operation and doesn't allow us to
         // hook up the event of being finished which results in our
         // unholy debounce hack (see extension.js)
         if(this._windowsChangedId > 0) {
            this._tracker.disconnect(this._windowsChangedId);
            this._windowsChangedId = 0;
         }
         if(this._appSysId > 0) {
            this._appSys.disconnect(this._appSysId);
            this._appSysId = 0;
         }
         for(let xid in this._registeredWindows) {
            this._nameUnwatchXid(xid);
            this._destroyMenu(xid);
            this._emitWindowUnregistered(xid);
         }
         this._registeredWindows = null;
         if(this._ownNameId) {
            Gio.DBus.session.unown_name(this._ownNameId);
            this._dbusImpl.unexport();
            this._ownName = null;
            this._ownNameId = null;
         }
      }
   }
};
Signals.addSignalMethods(X11RegisterMenuWatcher.prototype);

function GtkMenuWatcher() {
   this._init.apply(this, arguments);
}

GtkMenuWatcher.prototype = {
   _init: function() {
      this._registeredWindows = [];
      this._isWatching = false;
      this._appSysId = 0;
      this._windowsChangedId = 0;
      this._tracker = Shell.WindowTracker.get_default();
      this._appSys = Shell.AppSystem.get_default();
   },

   // Public functions
   watch: function() {
      if(!this.isWatching()) {
         if(this._windowsChangedId == 0) {
            this._windowsChangedId = this._tracker.connect('tracked-windows-changed',
                Lang.bind(this, this._updateWindowList));
         }
         if(this._appSysId == 0) {
            this._appSysId = this._appSys.connect('app-state-changed',
                Lang.bind(this, this._onAppMenuNotify));
         }
         this._isWatching = true;
         this._updateWindowList();
      }
   },

   getType: function() {
      return "GtkMenuWatcher";
   },

   renderMetadata: function() {
      let result = "";
      for (let id in this._registeredWindows) {
         if (this._registeredWindows[id].appMenu) {
            result += id + "-" + this.getType() + ",";
            result += this._registeredWindows[id].appMenu.renderMetadata() + ";";
         }
      }
      return result;
   },

   createFromArray: function(id, arr) {
      /*if ((arr.length == 5) && (arr[0] === this.getType())) {
         let senderDbus = arr[1];
         let menubarPath = arr[2];
         let windowPath = arr[3];
         let appPath = arr[4];
         this._registeredWindows[id] = {
            sender: senderDbus,
            menubarObjectPath: menubarPath,
            window: null,
            appMenu: new DBusMenu.DBusClient(senderDbus, menubarPath),
            fail: false
         };
      }*/
   },

   _onAppMenuNotify: function(appSys, targetAppSys) {
      let isBusy = (targetAppSys != null &&
                   (targetAppSys.get_state() == Shell.AppState.STARTING ||
                    targetAppSys.get_busy()));
      if (!isBusy) {
         let windows = this._findWindowForApp(targetAppSys);
         for(let pos in windows) {
            let index = windows[pos];
            let windData = this._registeredWindows[index];
            if (windData.window && !windData.appMenu) {
               this._tryToGetMenuClient(windData.window);
            }
         }
      }
   },

   _findWindowForApp: function(targetAppSys) {
      let windows = [];
      let id = targetAppSys.get_id();
      for (let i = 0; i < this._registeredWindows.length; i++) {
         let currentWindow = this._registeredWindows[i].window;
         if(currentWindow) {
             let currentTracker = this._tracker.get_window_app(currentWindow);
             if (currentTracker && (id == currentTracker.get_id()))
                 windows.push(i);
         }
      }
      return windows;
   },

   getMenuForWindow: function(window) {
      let index = this._findWindow(window);
      if(index != -1) {
         return this._registeredWindows[index].appMenu;
      }
      return null;
   },

   updateMenuForWindow: function(window) {
      let index = this._findWindow(window);
      if(index != -1) {
         let appmenu = this._registeredWindows[index].appMenu;
         if(appmenu) {
            appmenu.fakeSendAboutToShow(appmenu.getRootId());
            return true;
         }
      }
      return false;
   },

   isWatching: function() {
      return this._isWatching;
   },

   _findWindow: function(window) {
      for (let i = 0; i < this._registeredWindows.length; i++) {
         if (window == this._registeredWindows[i].window)
            return i;
      }
      return -1;
   },

   // Async because we may need to check the presence
   // of a menubar object as well as the creation is async.
   _getMenuClient: function(window, callback) {
      let index = this._findWindow(window);
      if(index != -1) {
         let sender = this._registeredWindows[index].sender;
         let menubarPath = this._registeredWindows[index].menubarObjectPath;
         let windowPath = this._registeredWindows[index].windowObjectPath;
         let appPath = this._registeredWindows[index].appObjectPath;
         let appMenu = this._registeredWindows[index].appMenu;
         if(sender && menubarPath && window && !appMenu &&
            (window.get_window_type() != Meta.WindowType.DESKTOP)) {
            let msg = "GtkMenu Watcher: Creating menu on %s, %s";
            global.log(msg.format(sender, menubarPath));
            callback(window, new DBusMenu.DBusClientGtk(sender, menubarPath, windowPath, appPath));
         } else {
            callback(window, null);
         }
      } else {
         callback(window, null);
      }
   },

   _onMenuClientReady: function(window, client) {
      let index = this._findWindow(window);
      if(this.isWatching() && (client != null) && (index != -1)) {
         this._registeredWindows[index].appMenu = client;
         let root = client.getRoot();//Problem with gtk....
         root.connectAndRemoveOnDestroy({
            'childs-empty'   : Lang.bind(this, this._onMenuEmpty, window),
            'destroy'        : Lang.bind(this, this._onMenuDestroy, window)
         });
         if(this.isWatching()) {
            this.emit('providers-changed');
            this.emit('client-menu-changed', this._registeredWindows[index].appMenu);
         }
      }
   },

   _onMenuEmpty: function(root, window) {
      // We don't have alternatives now, so destroy the appmenu.
      // this._onMenuDestroy(root, index);
   },

   _onMenuDestroy: function(root, window) {
      this._destroyMenu(window);
   },

   _destroyMenu: function(window) {
      let index = this._findWindow(window);
      if(index != -1) {
         let appMenu = this._registeredWindows[index].appMenu;
         this._registeredWindows[index].appMenu = null;
         if(appMenu) {
            appMenu.destroy();
         }
         if(this.isWatching()) {
            this.emit('client-menu-changed', null);
         }
      }
   },

   _updateWindowList: function() {
      // Note: In idle, because Mutter set the windows attribute when Gtk set it
      // and this is after create the window.
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, function() {
         let current = global.get_window_actors();
         let metaWindows = new Array();
         for (let index in current) {
            this._registerWindow(current[index].meta_window);
            metaWindows.push(current[index].meta_window);
         }
         for (let index in this._registeredWindows) {
            let win = this._registeredWindows[index].window;
            if(metaWindows.indexOf(win) == -1) {
               this._unregisterWindows(win);
            }
         }
      }));
   },

   _unregisterWindows: function(window) {
      let index = this._findWindow(window);
      if(index != -1) {
         this._destroyMenu(window);
         let appMenu = this._registeredWindows[index].appMenu;
         if(appMenu) {
            appMenu.destroy();
         }
         this._registeredWindows.splice(index, 1);
         if(this.isWatching()) {
            this.emit('client-menu-changed', null);
         }
      }
   },

   _registerWindow: function(window) {
      let senderDbus = null, appmenuPath = null, menubarPath = null;
      let windowPath = null, appPath = null;
      let appTracker = this._tracker.get_window_app(window);

      if(appTracker && (GTK_BLACKLIST.indexOf(appTracker.get_id()) == -1)) {
         let index = this._findWindow(window);
         if ((index == -1) || (this._registeredWindows[index].sender == null)) {
            menubarPath = window.get_gtk_menubar_object_path();
            appmenuPath = window.get_gtk_app_menu_object_path();
            windowPath  = window.get_gtk_window_object_path();
            appPath     = window.get_gtk_application_object_path();
            senderDbus  = window.get_gtk_unique_bus_name();
            // Hack: For some reason (gnome?), the menubar path disapear,
            // but we know where it's supposed that it will be if we have
            // the appmenuPath.
            if ((menubarPath == null) && (appmenuPath != null)) {
               menubarPath = appmenuPath.replace("appmenu", "menubar");
               if (menubarPath == appmenuPath) //Is not there.
                  menubarPath = null;
            }
            let windowData = {};
            //if (index != -1) //FIXME: What about override?
            //   windowData = this._registeredWindows[index];
            windowData["window"] = window;
            windowData["menubarObjectPath"] = menubarPath;
            windowData["appmenuObjectPath"] = appmenuPath;
            windowData["windowObjectPath"] = windowPath;
            windowData["appObjectPath"] = appPath;
            windowData["sender"] = senderDbus;
            windowData["icon"] = null;
            windowData["appMenu"] = null;
            windowData["fail"] = false;
            this._registeredWindows.push(windowData);
         }
         this._tryToGetMenuClient(window);
      }
   },

   _tryToGetMenuClient: function(window) {
      let index = this._findWindow(window);
      if((index != -1) && (!this._registeredWindows[index].appMenu)) {
         if((this._registeredWindows[index].menubarObjectPath) &&
            (this._registeredWindows[index].sender)) {
            if (!this._isWindowBusy(window)) {
               this._getMenuClient(window, Lang.bind(this, this._onMenuClientReady));
            }
         } else {
            this._registeredWindows[index].fail = true;
         }
      }  
   },

   _isWindowBusy: function(window) {
      let isBusy = true;
      let appTracker = this._tracker.get_window_app(window);
      if(appTracker && (GTK_BLACKLIST.indexOf(appTracker.get_id()) == -1)) {
         let appSys = this._appSys.lookup_app(appTracker.get_id());
         isBusy = (appSys != null &&
                  (appSys.get_state() == Shell.AppState.STARTING ||
                   appSys.get_busy()));
      }
      return isBusy;
   },

   destroy: function() {
      if(this.isWatching()) {
         // This doesn't do any sync operation and doesn't allow us to hook up
         // the event of being finished which results in our unholy debounce
         // hack (see extension.js)
         this._isWatching = false;
         if(this._windowsChangedId > 0) {
            this._tracker.disconnect(this._windowsChangedId);
            this._windowsChangedId = 0;
         }
         if(this._appSysId > 0) {
            this._appSys.disconnect(this._appSysId);
            this._appSysId = 0;
         }
         for(let index in this._registeredWindows) {
            this._destroyMenu(this._registeredWindows[index].window);
         }
         this._registeredWindows = null;
      }
   }
};
Signals.addSignalMethods(GtkMenuWatcher.prototype);

/*
 * The IndicatorAppMenuWatcher class implements the IndicatorAppMenu dbus object
 */
function IndicatorAppMenuWatcher() {
   this._init.apply(this, arguments);
}

IndicatorAppMenuWatcher.prototype = {

   _init: function(mode, iconSize) {
      this._mode = mode;
      this._iconSize = iconSize;
      this._windowsChangedId = 0;
      this._focusWindowId = 0;
      this._buggyClientId = 0;
      this._tracker = Shell.WindowTracker.get_default();

      this.providers = [
         new X11RegisterMenuWatcher(),
         new GtkMenuWatcher()
      ];
      for(let i = 0; i < this.providers.length; i++) {
         this.providers[i].connect('client-menu-changed', Lang.bind(this, this._onMenuChange));
         this.providers[i].connect('providers-changed', Lang.bind(this, this._onProvidersChange));
      }
   },

   _onProvidersChange: function(provider) {
      this.emit('providers-changed', provider);
   },

   renderMetadata: function() {
      let result = "";
      for(let i = 0; i < this.providers.length; i++) {
         result += this.providers[i].renderMetadata();
      }
      return result;
   },

   loadFromString: function(data) {
      let providers = data.split(";");
      for(let pos in providers) {
         let [id, attrib] = providers[pos].split("-");
         if (attrib && attrib.length > 0) {
            let info = attrib.split(",");
            if (info.length > 0) {
               for(let i = 0; i < this.providers.length; i++) {
                  if(this.providers[i].getType() === info[0]) {
                     this.providers[i].createFromArray(id, info);
                  }
               }
            }
         }
      }
   },

   _onMenuChange: function(client, menu) {
      let window = this.getFocusWindow();
      if(window && (menu == client.getMenuForWindow(window))) {
          this.emit('appmenu-changed', window, menu);
      }
   },

   // Public functions
   watch: function() {
      if(!this.isWatching()) {
         for(let i = 0; i < this.providers.length; i++) {
            this.providers[i].watch();
         }
         this._onWindowChanged();
         if(this._focusWindowId == 0) {
            this._focusWindowId = global.screen.get_display().connect('notify::focus-window',
                                  Lang.bind(this, this._onWindowChanged));
         }
      }
   },

   getRootMenuForWindow: function(window) {
      let appmenu = this.getMenuForWindow(window);
      if(appmenu)
         return appmenu.getRoot();
      return null;
   },

   getMenuForWindow: function(window) {
      for(let i = 0; i < this.providers.length; i++) {
         let appmenu = this.providers[i].getMenuForWindow(window);
         if(appmenu)
            return appmenu;
      }
      return null;
   },

   updateMenuForWindow: function(window) {
      for(let i = 0; i < this.providers.length; i++) {
         this.providers[i].updateMenuForWindow(window);
      }
   },

   getAppForWindow: function(window) {
      return this._tracker.get_window_app(window);
   },

   getIconForWindow: function(window) {
      let app = this.getAppForWindow(window);
      if(app) {
         return app.create_icon_texture(this._iconSize);
      }
      return null;
   },

   setIconSize: function(iconSize) {
      this._iconSize = iconSize;
   },

   getFocusWindow:function() {
      let window = global.display.focus_window;
      if(window && (window.get_window_type() != Meta.WindowType.DESKTOP)) {
         return window;
      }
      return null;
   },

   _onWindowChanged: function() {
      let window = this.getFocusWindow();
      if(window) {
         if(this.isWatching()) {
            let menu = this.getMenuForWindow(window);
            this.emit('appmenu-changed', window, menu);
         } else {
            this.emit('appmenu-changed', window, null);
         }
      } else if(!global.stage.key_focus) {
         this.emit('appmenu-changed', null, null);
      }
   },

   isWatching: function() {
      if(this.providers && this.providers.length > 0) {
         for(let i = 0; i < this.providers.length; i++) {
            if(!this.providers[i].isWatching())
               return false;
         }
         return true;
      }
      return false;
   },

   destroy: function() {
      if(this.providers) {
         // This doesn't do any sync operation and doesn't allow us to hook up
         // the event of being finished which results in our unholy debounce
         // hack (see extension.js)
         for(let i = 0; i < this.providers.length; i++) {
            this.providers[i].destroy();
         }
         this.providers = null;
         if(this._focusWindowId > 0) {
            global.screen.get_display().disconnect(this._focusWindowId);
            this._focusWindowId = 0;
         }
         this._registeredWindows = null;
         this.emit('appmenu-changed', null, null);
      }
   }
};
Signals.addSignalMethods(IndicatorAppMenuWatcher.prototype);
