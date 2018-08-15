/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * modulesLoader.js - A library to load modules witch Side Pages in Gnome Classic Settings -
 * ========================================================================================================
 */

const Lang = imports.lang;
const Signals = imports.signals;
const Gio = imports.gi.Gio;

const SUFIX = ".js";

const ExtensionType = {
    SYSTEM: 1,
    PER_USER: 2
};

const ModulesManager = new Lang.Class({
    Name: 'ModulesManager',

    _init: function() {
        this.modules = {};
        this.imports = {};
        this.instances = {};
    },

    scan: function(path, prefix, requiered) {
        this.modules = {};
        this.imports = {};
        this.instances = {};
        let dir = Gio.File.new_for_path(path);
        let fileEnum;
        try {
            fileEnum = dir.enumerate_children('standard::name,standard::type',
                                              Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
            fileEnum = null;
        }
        if (fileEnum != null) {
            let info;
            while ((info = fileEnum.next_file(null))) {
                if ((info.get_file_type() == Gio.FileType.REGULAR) &&
                   info.get_name().startsWith(prefix) && info.get_name().endsWith(SUFIX)) {
                    let name = info.get_name().slice(prefix.length, -1*SUFIX.length);
                    let moduleName = info.get_name().slice(0, -1*SUFIX.length);
                    this.modules[name] = [moduleName, fileEnum.get_child(info), info];
                }
            }
        }
        for (let name in this.modules) {
            let moduleName = this.modules[name][0];
            try {
                this.imports[name] = cimports.settings.modules[moduleName];
                if(this.imports[name].Module) {
                    let instance = new this.imports[name].Module();
                    if(this._satisficeRequieriments(instance, requiered)) {
                        this.instances[name] = instance;
                        print("Loaded module: " + name + "\n");
                    }
                }
            } catch(e) {
                print("Error: Can not import the module %s %s\n".format(name, e));
            }
        }
    },

    _satisficeRequieriments: function(instance, requiered) {
        for (let pos in requiered) {
            if (!(requiered[pos] in instance))
                return false;
        }
        return true;
    },

    haveInstance: function(name) {
        return (name in this.instances);
    },

    getInstance: function(name) {
        if(this.haveInstance(name))
            return this.instances[name];
        return null;
    },
});
Signals.addSignalMethods(ModulesManager.prototype);
