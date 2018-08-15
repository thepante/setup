// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;
//const ExtensionSystem = cimports.ui.extensionSystem;
//const Util = cimports.misc.util;
//const Extension = cimports.ui.extension;

const Config = imports.misc.config;

const DbusSettingsIface =
    '<node> \
        <interface name="org.Gnome.Global.Menu"> \
            <method name="activateCallback"> \
                <arg type="s" direction="in" /> \
                <arg type="s" direction="in" /> \
                <arg type="s" direction="in" /> \
            </method> \
            <method name="updateSetting"> \
                <arg type="s" direction="in" /> \
                <arg type="s" direction="in" /> \
                <arg type="s" direction="in" /> \
                <arg type="s" direction="in" /> \
            </method> \
            <method name="ReloadXlet"> \
                <arg type="s" direction="in" name="uuid" /> \
                <arg type="s" direction="in" name="type" /> \
            </method> \
            <method name="highlightXlet"> \
                <arg type="s" direction="in" /> \
                <arg type="s" direction="in" /> \
                <arg type="b" direction="in" /> \
            </method> \
            <signal name="XletAddedComplete"> \
                <arg type="b" direction="out" /> \
                <arg type="s" direction="out" /> \
            </signal> \
        </interface> \
    </node>';

function ServerSettings(manager) {
    this._init(manager);
}

ServerSettings.prototype = {
    _init: function(manager) {
        this.settingsManager = manager;
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(DbusSettingsIface, this);
        this._dbusImpl.export(Gio.DBus.session, '/org/Gnome/Global/Menu');
        this._ownNameId = Gio.DBus.session.own_name('org.Gnome.Global.Menu', Gio.BusNameOwnerFlags.REPLACE, null, null);
    },

    _getXletObject: function(uuid, instance_id) {
        let obj = null;
        let settings = this.settingsManager.uuids[uuid][instance_id];
        if(settings)
            obj = settings.bindObject;
        return obj;
    },

    EmitXletAddedComplete: function(success, uuid, name) {
        this._dbusImpl.emit_signal('XletAddedComplete', GLib.Variant.new('(bs)', [success, uuid]));
    },

    ReloadXlet: function(uuid, type) {
        //Extension.reloadExtension(uuid, Extension.Type[type]);
    },

    activateCallback: function(callback, uuid, instance_id) {
        let obj = this._getXletObject(uuid, instance_id);
        let cb = Lang.bind(obj, obj[callback]);
        cb();
    },

    updateSetting: function(uuid, instance_id, key, payload) {
        this.settingsManager.uuids[uuid][instance_id].remoteUpdate(key, payload);
    },

    PushSubprocessResult: function(process_id, result) {
        /*if (Util.subprocess_callbacks[process_id]) {
            Util.subprocess_callbacks[process_id](result);
        }*/
    },

    highlightXlet: function(uuid, instance_id, highlight) {
        let obj = this._getXletObject(uuid, instance_id);
        if (obj && obj.highlight) {
            obj.highlight(highlight);
        }
    },

    destroy: function() {
        this.settingsManager = null;
        if(this._ownNameId) {
            Gio.DBus.session.unown_name(this._ownNameId);
            this._dbusImpl.unexport();
            this._dbusImpl = null;
            this._ownNameId = null;
        }
    },

    CinnamonVersion: Config.PACKAGE_VERSION
};

