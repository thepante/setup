/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const Layout = imports.ui.layout;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Config = imports.misc.config;
const Mainloop = imports.mainloop;

// This object will contain all the global variables
let data = {};

/**
 * Replaces a method in a class with our own method, and stores the original
 * one in 'data' using 'old_XXXX' (being XXXX the name of the original method),
 * or 'old_classId_XXXX' if 'classId' is defined. This is done this way for the
 * case that two methods with the same name must be replaced in two different
 * classes
 *
 * @param {class} className The class where to replace the method
 * @param {string} methodName The method to replace
 * @param {function} functionToCall The function to call as the replaced method
 * @param {string} [classId] an extra ID to identify the stored method when two
 *                           methods with the same name are replaced in
 *                           two different classes
 */
function replaceMethod(className, methodName, functionToCall, classId) {
    if (classId) {
        data['old_' + classId + '_' + methodName] = className.prototype[methodName];
    } else {
        data['old_' + methodName] = className.prototype[methodName];
    }
    className.prototype[methodName] = functionToCall;
}

function init() {
    data.isEnabled = false;
    data.launchDesktopId = 0;
    data.currentProcess = null;
    data.desktopWindows = [];
    data.reloadTime = 100;
    // Ensure that there aren't "rogue" processes
    doKillAllOldDesktopProcesses();
}

/**
 * Receives a list of metaWindow or metaWindowActor objects, and remove from it
 * our desktop window
 *
 * @param {GList} windowList A list of metaWindow or metaWindowActor objects
 * @returns {GList} The same list, but with the desktop window removed
 */
function removeDesktopWindowFromList(windowList) {

    if (!data.currentProcess) {
        return windowList;
    }
    let returnVal = [];
    for(let element of windowList) {
        let window = element;
        if (window.get_meta_window) { // it is a MetaWindowActor
            window = window.get_meta_window();
        }
        let belongs;
        try {
            belongs = data.currentProcess.query_window_belongs_to(window);
        } catch(err) {
            belongs = false;
        }
        if (!belongs) {
            returnVal.push(element);
        }
    }
    return returnVal;
}

/**
 * Method replacement for Meta.Display.get_tab_list
 * It removes the desktop window from the list of windows in the switcher
 *
 * @param {*} type
 * @param {*} workspace
 */
function newGetTabList(type, workspace) {
    let windowList = data.old_get_tab_list.apply(this, [type, workspace]);
    return removeDesktopWindowFromList(windowList);
};

/**
 * Method replacement for Shell.Global.get_window_actors
 * It removes the desktop window from the list of windows in the Activities mode
 */
function newGetWindowActors() {
    let windowList = data.old_get_window_actors.apply(this, []);
    return removeDesktopWindowFromList(windowList);
}

/**
 * Method replacement for Meta.Workspace.list_windows
 */
function newListWindows() {
    let windowList = data.old_list_windows.apply(this, []);
    return removeDesktopWindowFromList(windowList);
};

/**
 * Enables the extension
 */
function enable() {
    // If the desktop is still starting up, we wait until it is ready
    if (Main.layoutManager._startingUp) {
        data.startupPreparedId = Main.layoutManager.connect('startup-complete', () => { innerEnable(true); });
    } else {
        innerEnable(false);
    }
}

/**
 * Extracts the desktop number from the window title, no matter if it has an UUID or not
 * @param {string} title The window title
 * @returns The desktop number, or -1 if there is no valid number
 */
function getDesktopNumber(title) {
    try {
        let pos = title.indexOf(" ");
        if (pos == -1) {
            return parseInt(title);
        } else {
            return parseInt(title.substring(pos+1));
        }
    } catch(e) {
        return -1;
    }
}

/**
 * The true code that configures everything and launches the desktop program
 */
function innerEnable(removeId) {

    if (removeId) {
        Main.layoutManager.disconnect(data.startupPreparedId);
        data.startupPreparedId = null;
    }

    // under X11 we don't need to cheat, so only do all this under wayland
    if (Meta.is_wayland_compositor()) {
        replaceMethod(Meta.Display, 'get_tab_list', newGetTabList);
        replaceMethod(Shell.Global, 'get_window_actors', newGetWindowActors);
        replaceMethod(Meta.Workspace, 'list_windows', newListWindows);

        data.idMap = global.window_manager.connect_after('map', (obj, windowActor) => {
            for (let desktopWindow of data.desktopWindows) {
                try {
                    desktopWindow.lower();
                } catch {}
            }
            if (!data.currentProcess) {
                return false;
            }
            let window = windowActor.get_meta_window();
            /*
            * If the window title is the same than the UUID (which was passed through a secure
            * channel), then this is the window of our process, so we manage it.
            */
            let belongs;
            try {
                belongs = data.currentProcess.query_window_belongs_to(window);
            } catch(err) {
                belongs = false;
            }
            if (belongs) {
                /*
                * the desktop window is big enough to cover all the monitors in the system,
                * so the first thing to do is to move it to the minimum coordinate of the desktop.
                *
                * In theory, the minimum coordinates are always (0,0); but if there is only one
                * monitor, the coordinates used are (0,27) because the top bar uses that size, and
                * it makes no sense in having a piece of window always covered by the bar. Of
                * course, that value isn't fixed, but calculated automatically each time the
                * desktop geometry changes, so a bigger top bar will work fine.
                */
                let desktopNumber = getDesktopNumber(window.get_title());
                if ((desktopNumber >= 0) && (desktopNumber < data.desktopCoordinates.length)) {
                    window.move_frame(false,
                                      data.desktopCoordinates[desktopNumber].x,
                                      data.desktopCoordinates[desktopNumber].y);
                    // Show the window in all desktops, and send it to the bottom
                    window.stick();
                    window.lower();
                    data.desktopWindows.push(window);
                    // keep the window at the bottom when the user clicks on it
                    window.connect_after('raised', () => {
                        window.lower();
                    });
                    // Don't allow to move it with Alt+F7 or other special keys
                    window.connect('position-changed', () => {
                        let desktopNumber = getDesktopNumber(window.get_title());
                        window.move_frame(false,
                                          data.desktopCoordinates[desktopNumber].x,
                                          data.desktopCoordinates[desktopNumber].y);
                    });
                } else {
                    global.log(`Desktop number not valid: ${desktopNumber}`);
                }
            }
            return false;
        });
        data.switchWorkspaceId = global.window_manager.connect('switch-workspace', () => {
            /*
             * If the user switches to another workspace, ensure that the desktop window
             * is sent to the bottom, thus giving the focus to any window that is there
             */
            for (let desktopWindow of data.desktopWindows) {
                try {
                    desktopWindow.lower();
                } catch {}
            }
        });
    }

    /*
     * If the desktop geometry changes (because a new monitor has been added, for example),
     * we kill the desktop program. It will be relaunched automatically with the new geometry,
     * thus adapting to it on-the-fly.
     */
    data.monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
        data.reloadTime = 3000; // give more time in this case, to ensure that everything has changed
        killCurrentProcess();
    });

    data.desktopCoordinates = [];

    /*
     * This callback allows to detect a change in the working area (like when changing the Zoom value)
     */
    data.sizeChangedId = global.window_manager.connect('size-changed', () => {
        if (data.desktopCoordinates.length != Main.layoutManager.monitors.length) {
            killCurrentProcess();
            return;
        }
        for(let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
            let ws = global.workspace_manager.get_workspace_by_index(0);
            let area = ws.get_work_area_for_monitor(monitorIndex);
            let area2 = data.desktopCoordinates[monitorIndex];
            if ((area.width != area2.width) || (area.height != area2.height)) {
                killCurrentProcess();
                return;
            }
        }
    });

    data.isEnabled = true;
    if (data.launchDesktopId) {
        GLib.source_remove(data.launchDesktopId);
    }
    launchDesktop();
}

/**
 * Disables the extension
 */
function disable() {

    data.isEnabled = false;
    // restore external methods only if have been intercepted
    if (data.old_get_tab_list) {
        Meta.Display.prototype['get_tab_list'] = data.old_get_tab_list;
    }
    if (data.old_get_window_actors) {
        Shell.Global.prototype['get_window_actors'] = data.old_get_window_actors;
    }
    if (data.old_list_windows) {
        Meta.Workspace.prototype['list_windows'] = data.old_list_windows;
    }
    // disconnect signals only if connected
    if (data.switchWorkspaceId) {
        global.window_manager.disconnect(data.switchWorkspaceId);
    }
    if (data.startupPreparedId) {
        Main.layoutManager.disconnect(data.startupPreparedId);
    }
    if (data.idMap) {
        global.window_manager.disconnect(data.idMap);
    }
    if (data.monitorsChangedId) {
        Main.layoutManager.disconnect(data.monitorsChangedId);
    }
    if (data.sizeChangedId) {
        global.window_manager.disconnect(data.sizeChangedId);
    }
    killCurrentProcess();
}

/**
 * Kills the current desktop program
 */
function killCurrentProcess() {
    // If a reload was pending, kill it and program a new reload
    if (data.launchDesktopId) {
        GLib.source_remove(data.launchDesktopId);
        data.launchDesktopId = 0;
        if (data.isEnabled) {
            data.launchDesktopId = Mainloop.timeout_add(data.reloadTime, () => {
                data.launchDesktopId = 0;
                launchDesktop();
                return false;
            });
        }
    }

    // kill the desktop program. It will be reloaded automatically.
    data.desktopWindows = [];
    data.appUUID = null;
    if (data.currentProcess && data.currentProcess.subprocess) {
        data.currentProcess.subprocess.force_exit();
    }
}

/**
 * This function checks all the processes in the system and kills those
 * that are a desktop manager from the current user (but not others).
 * This allows to avoid having several ones in case gnome shell resets,
 * or other odd cases. It requires the /proc virtual filesystem, but
 * doesn't fail if it doesn't exist.
 */

function doKillAllOldDesktopProcesses() {

    let procFolder = Gio.File.new_for_path('/proc');
    if (!procFolder.query_exists(null)) {
        return;
    }

    let fileEnum = procFolder.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
    let info;
    while ((info = fileEnum.next_file(null))) {
        let filename = info.get_name();
        if (!filename) {
            break;
        }
        let processPath = GLib.build_filenamev(['/proc', filename, 'cmdline']);
        let processUser = Gio.File.new_for_path(processPath);
        if (!processUser.query_exists(null)) {
            continue;
        }
        let [data, etag] = processUser.load_bytes(null);
        let contents = '';
        data = data.get_data();
        for (let i = 0; i < data.length; i++) {
            if (data[i] < 32) {
                contents += ' ';
            } else {
                contents += String.fromCharCode(data[i]);
            }
        }
        let path = 'gjs ' + GLib.build_filenamev([ExtensionUtils.getCurrentExtension().path, 'ding.js']);
        if (contents.startsWith(path)) {
            let proc = new Gio.Subprocess({argv: ['/bin/kill', filename]});
            proc.init(null);
            proc.wait(null);
        }
    }
}

/**
 * Launches the desktop program, passing to it the current desktop geometry for each monitor
 * and the path where it is stored. It also monitors it, to relaunch it in case it dies or is
 * killed. Finally, it reads STDOUT and STDERR and redirects them to the journal, to help to
 * debug it.
 */
function launchDesktop() {

    data.reloadTime = 100;
    let argv = [];
    argv.push(GLib.build_filenamev([ExtensionUtils.getCurrentExtension().path, 'ding.js']));
    // Specify that it must work as true desktop
    argv.push('-E');
    // The path. Allows the program to find translations, settings and modules.
    argv.push('-P');
    argv.push(ExtensionUtils.getCurrentExtension().path);

    let first = true;

    data.desktopCoordinates = [];

    let scale;
    for(let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
        let ws = global.workspace_manager.get_workspace_by_index(0);
        let area = ws.get_work_area_for_monitor(monitorIndex);
        // send the working area of each monitor in the desktop
        argv.push('-D');
        if (ExtensionUtils.versionCheck(['3.30'], Config.PACKAGE_VERSION)) {
            scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        } else {
            scale = Main.layoutManager.monitors[monitorIndex].geometry_scale;
        }
        argv.push(`${area.x}:${area.y}:${area.width}:${area.height}:${scale}`);
        data.desktopCoordinates.push({x: area.x, y: area.y, width: area.width, height: area.height, zoom: scale})
        if (first || (area.x < data.minx)) {
            data.minx = area.x;
        }
        if (first || (area.y < data.miny)) {
            data.miny = area.y;
        }
        if (first || ((area.x + area.width) > data.maxx)) {
            data.maxx = area.x + area.width;
        }
        if (first || ((area.y + area.height) > data.maxy)) {
            data.maxy = area.y + area.height;
        }
        first = false;
    }

    data.currentProcess = new LaunchSubprocess(0, "DING", "-U");
    data.currentProcess.set_cwd(GLib.get_home_dir());
    data.currentProcess.spawnv(argv);

    /*
     * If the desktop process dies, wait 100ms and relaunch it, unless the exit status is different than
     * zero, in which case it will wait one second. This is done this way to avoid relaunching the desktop
     * too fast if it has a bug that makes it fail continuously, avoiding filling the journal too fast.
     */
    data.currentProcess.subprocess.wait_async(null, (obj, res) => {
        let b = obj.wait_finish(res);
        if (!data.isEnabled || !data.currentProcess || obj !== data.currentProcess.subprocess) {
            return;
        }
        if (obj.get_if_exited()) {
            let retval = obj.get_exit_status();
            if (retval != 0) {
                data.reloadTime = 1000;
            }
        } else {
            data.reloadTime = 1000;
        }
        data.desktopWindows = [];
        data.currentProcess = null;
        if (data.isEnabled) {
            if (data.launchDesktopId) {
                GLib.source_remove(data.launchDesktopId);
            }
            data.launchDesktopId = Mainloop.timeout_add(data.reloadTime, () => {
                data.launchDesktopId = 0;
                launchDesktop();
                return false;
            });
        }
    });
}

/**
 * This class encapsulates the code to launch a subprocess that can detect whether a window belongs to it
 * It only accepts to do it under Wayland, because under X11 there is no need to do these tricks
 *
 * It is compatible with https://gitlab.gnome.org/GNOME/mutter/merge_requests/754 to simplify the code
 *
 * @param {int} flags Flags for the SubprocessLauncher class
 * @param {string} process_id An string id for the debug output
 * @param {string} cmd_parameter A command line parameter to pass when running. It will be passed only under Wayland,
 *                          so, if this parameter isn't passed, the app can assume that it is running under X11.
 */
var LaunchSubprocess = class {

    constructor(flags, process_id, cmd_parameter) {
        this._process_id = process_id;
        this._cmd_parameter = cmd_parameter;
        this._UUID = null;
        this._flags = flags | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE;
        if (Meta.is_wayland_compositor()) {
            this._flags |= Gio.SubprocessFlags.STDIN_PIPE;
        }
        this._launcher = new Gio.SubprocessLauncher({flags: this._flags});
        this.subprocess = null;
        this.process_running = false;
    }

    spawnv(argv) {
        let UUID_string = null;
        if (Meta.is_wayland_compositor()) {
            /*
             * Generate a random UUID to allow the extension to identify the window. It must be random
             * to avoid other programs to cheat and pose themselves as the true process. This also means that
             * launching the program from the command line won't give "superpowers" to it,
             * but will work like any other program. Of course, under X11 it doesn't matter, but it does
             * under Wayland.
             */
            this._UUID = GLib.uuid_string_random();
            UUID_string = this._UUID + '\n';
            argv.push(this._cmd_parameter);
        }
        this.subprocess = this._launcher.spawnv(argv);
        if (this.subprocess) {
                /*
                 * Send the UUID to the application using STDIN as a "secure channel". Sending it as a parameter
                 * would be insecure, because another program could read it and create a window before our process,
                 * and cheat the extension. This is done only in Wayland, because under X11 there is no need for it.
                 *
                 * It also reads STDOUT and STDERR and sends it to the journal using global.log(). This allows to
                 * have any error from the desktop app in the same journal than other extensions. Every line from
                 * the desktop program is prepended with the "process_id" parameter sent in the constructor.
                 */
            this.subprocess.communicate_utf8_async(UUID_string, null, (object, res) => {
                try {
                    let [d, stdout, stderr] = object.communicate_utf8_finish(res);
                    if (stdout.length != 0) {
                        global.log(`${this._process_id}: ${stdout}`);
                    }
                } catch(e) {
                    global.log(`${this._process_id}_Error: ${e}`);
                }
            });
            this.subprocess.wait_async(null, () => {
                this.process_running = false;
            });
            this.process_running = true;
        }
        return this.subprocess;
    }

    set_cwd(cwd) {
        this._launcher.set_cwd (cwd);
    }

    /**
     * Queries whether the passed window belongs to the launched subprocess or not.
     * @param {MetaWindow} window The window to check.
     */
    query_window_belongs_to (window) {
        if (!Meta.is_wayland_compositor()) {
            throw new Error ("Not in wayland");
        }
        if (this._UUID == null) {
            throw new Error ("No process running");
        }
        if (!this.process_running) {
            throw new Error ("No process running");
        }
        return (window.get_title().startsWith(this._UUID));
    }
}
