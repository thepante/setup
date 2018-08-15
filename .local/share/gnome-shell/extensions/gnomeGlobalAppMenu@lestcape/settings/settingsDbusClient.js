/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * SettingsDbusClient.js - A GDBus client to our settings -
 * ========================================================================================================
 */

const Lang = imports.lang;
const Signals = imports.signals;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;

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

const ProxyWrapper = Gio.DBusProxy.makeProxyWrapper(DbusSettingsIface);

function ClientSettings() {
    this._init();
}

ClientSettings.prototype = {
    _init: function() {
        this._proxy = null;
        this._initProxy = new ProxyWrapper(Gio.DBus.session, 'org.Gnome.Global.Menu', '/org/Gnome/Global/Menu', Lang.bind(this, this._clientReady), null);
    },

    _clientReady: function(result, error) {
        if (error) {
            //FIXME: show message to the user?
            this._proxy = null;
            global.log("Could not initialize settings proxy: " + error);
            return;
        }
        this._proxy = this._initProxy;
        if (this._proxy) {
            global.log("Initialize settings proxy");
            this._proxy.connectSignal("XletAddedComplete", Lang.bind(this, this._onXletAddedComplete));
        }
    },

    reloadXlet: function(uuid, collection_type) {
        if (this._proxy) {
            this._proxy.ReloadXletRemote(uuid, collection_type);
        }
    },

    _onXletAddedComplete: function(proxy, success, uuid) {
        this.emit("xlet-added-complete", success, uuid);
    },

    activateCallback: function(xletCallback, uuid, instance_id) {
        if (this._proxy) {
            this._proxy.activateCallbackRemote(xletCallback, uuid, instance_id);
        }
    },

    updateSetting: function(uuid, instance_id, key, json_value) {
        if (this._proxy) {
            this._proxy.updateSettingRemote(uuid, instance_id, key, json_value);
        }
    },

    highlightXlet: function(uuid, instance_id, state) {
        if (this._proxy) {
            this._proxy.highlightXletRemote(uuid, instance_id, state);
        }
    },
}
Signals.addSignalMethods(ClientSettings.prototype);
