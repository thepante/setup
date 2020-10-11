/* Emulate X11WindowType
 *
 * Copyright (C) 2020 Sergio Costas (rastersoft@gmail.com)
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

const Shell = imports.gi.Shell;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;

class ManageWindow {
    /* This class is added to each managed window, and it's used to
       make it behave like an X11 Desktop window.

       Trusted windows will set in the title the characters @!, followed
       by the coordinates where to put the window separated by a colon, and
       ended in semicolon. After that, it can have one or more of these letters

       * B : put this window at the bottom of the screen
       * T : put this window at the top of the screen
       * D : show this window in all desktops
       * H : hide this window from window list

       Using the title is not a problem because this is only useful for windows
       without decorations.
    */

    constructor(window) {
        this._window = window;
        this._signalIDs = [];
        this._signalIDs.push(window.connect_after('raised', () => {
            if (this._keepAtBottom && !this._keepAtTop) {
                this._window.lower();
            }
        }));
        this._signalIDs.push(this._window.connect('position-changed', () => {
            if ((this._x !== null) && (this._y !== null)) {
                this._window.move_frame(false, this._x, this._y);
            }
        }));
        this._signalIDs.push(window.connect("notify::title", () => {
            this._parseTitle();
        }));
        this._parseTitle();
    }

    disconnect() {
        for(let signalID of this._signalIDs) {
            this._window.disconnect(signalID);
        }
        if (this._keepAtTop) {
            this._window.unmake_above();
        }
    }

    _parseTitle() {
        this._x = null;
        this._y = null;
        this._keepAtBottom = false;
        let keepAtTop = this._keepAtTop;
        this._keepAtTop = false;
        this._showInAllDesktops = false;
        this._hideFromWindowList = false;
        let title = this._window.get_title();
        if (title != null) {
            let pos = title.search("@!");
            if (pos != -1) {
                let pos2 = title.search(";", pos)
                let coords;
                if (pos2 != -1) {
                    coords = title.substring(pos+2, pos2).trim().split(",");
                } else {
                    coords = title.substring(pos+2).trim().split(",");
                }
                try {
                    this._x = parseInt(coords[0]);
                    this._y = parseInt(coords[1]);
                } catch(e) {
                    print(`Exception ${e.message}`);
                }
                try {
                    let extra_chars = title.substring(pos2).trim().toUpperCase();
                    for (let char of extra_chars) {
                        switch (char) {
                        case 'B':
                            this._keepAtBottom = true;
                            this._keepAtTop = false;
                            break;
                        case 'T':
                            this._keepAtTop = true;
                            this._keepAtBottom = false;
                            break;
                        case 'D':
                            this._showInAllDesktops = true;
                            break;
                        case 'H':
                            this._hideFromWindowList = true;
                            break;
                        }
                    }
                } catch(e) {
                    print(`Exception ${e.message}`);
                }
            }
            if (this._keepAtTop != keepAtTop) {
                if (this._keepAtTop) {
                    this._window.make_above();
                } else {
                    this._window.unmake_above();
                }
            }
            if (this._keepAtBottom) {
                this._window.lower();
            }
            if ((this._x !== null) && (this._y !== null)) {
                this._window.move_frame(false, this._x, this._y);
            }
        }
    }

    refreshState(checkWorkspace) {
        if (this._keepAtBottom) {
            this._window.lower();
        }
        if (checkWorkspace && this._showInAllDesktops) {
            let currentWorkspace = global.workspace_manager.get_active_workspace();
            if (!this._window.located_on_workspace(currentWorkspace)) {
                this._window.change_workspace(currentWorkspace);
            }
        }
    }

    get hideFromWindowList() {
        return this._hideFromWindowList;
    }

    get keepAtBottom() {
        return this._keepAtBottom;
    }
}

var EmulateX11WindowType = class {
    /*
     This class makes all the heavy lifting for emulating WindowType.
     Just make one instance of it, call enable(), and whenever a window
     that you want to give "superpowers" is mapped, add it with the
     "addWindow" method. That's all.
     */
    constructor () {
        this._isX11 = !Meta.is_wayland_compositor();
        this._windowList = [];
        this._enableRefresh = true;
    }

    enable() {
        if (this._isX11) {
            return;
        }
        replaceMethod(Meta.Display, 'get_tab_list', newGetTabList);
        replaceMethod(Shell.Global, 'get_window_actors', newGetWindowActors);
        replaceMethod(Meta.Workspace, 'list_windows', newListWindows);
        this._idMap = global.window_manager.connect_after('map', () => {
            this._refreshWindows(false);
        });

        /* Something odd happens with "stick" when using popup submenus, so
           this implements the same functionality
         */
        this._switchWorkspaceId = global.window_manager.connect('switch-workspace', () => {
            this._refreshWindows(true);
        });

        /* But in Overview mode it is paramount to not change the workspace to emulate
           "stick", or the windows will appear
         */
        this._showingId = Main.overview.connect('showing', () => {
            this._enableRefresh = false;
        });

		this._hidingId = Main.overview.connect('hiding', () => {
            this._enableRefresh = true;
            this._refreshWindows(true);
        });
    }

    disable() {
        if (this._isX11) {
            return;
        }
        for(let window of this._windowList) {
            this._clearWindow(window);
        }
        this._windowList = [];
        // restore external methods only if have been intercepted
        if (replaceData.old_get_tab_list) {
            Meta.Display.prototype['get_tab_list'] = replaceData.old_get_tab_list;
        }
        if (replaceData.old_get_window_actors) {
            Shell.Global.prototype['get_window_actors'] = replaceData.old_get_window_actors;
        }
        if (replaceData.old_list_windows) {
            Meta.Workspace.prototype['list_windows'] = replaceData.old_list_windows;
        }
        replaceData = {};
        // disconnect signals
        if (this._idMap) {
            global.window_manager.disconnect(this._idMap);
        }
        if (this._switchWorkspaceId) {
            global.window_manager.disconnect(this._switchWorkspaceId);
        }
        if (this._showingId) {
            Main.overview.disconnect(this._showingId);
        }
        if (this._hidingId) {
            Main.overview.disconnect(this._hidingId);
        }
    }

    addWindow(window) {
        if (this._isX11) {
            return;
        }
        if (window.get_meta_window) { // it is a MetaWindowActor
            window = window.get_meta_window();
        }
        window.customJS_ding = new ManageWindow(window);
        this._windowList.push(window);
        window.customJS_ding.unmanagedID = window.connect("unmanaged", (window) => {
            this._clearWindow(window);
            this._windowList = this._windowList.filter(item => item !== window);
        });
    }

    _clearWindow(window) {
        window.disconnect(window.customJS_ding.unmanagedID);
        window.customJS_ding.disconnect();
        window.customJS_ding = null;
    }

    _refreshWindows(checkWorkspace) {
        if (this._enableRefresh) {
            for (let window of this._windowList) {
                window.customJS_ding.refreshState(checkWorkspace);
            }
            if (checkWorkspace) {
                // activate the top-most window
                let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, global.workspace_manager.get_active_workspace());
                let lastWindow = null;
                for (let window of windows) {
                    lastWindow = window;
                    if (!window.customJS_ding || !window.customJS_ding.keepAtBottom) {
                        Main.activateWindow(window);
                        lastWindow = null;
                        break;
                    }
                }
                if (lastWindow) {
                    // if there is only the bottom window, activate it
                    Main.activateWindow(lastWindow);
                }
            }
        }
    }
}

/**
 * Functions used to remove a window from the window list
 */

let replaceData = {};

/**
 * Replaces a method in a class with our own method, and stores the original
 * one in 'replaceData' using 'old_XXXX' (being XXXX the name of the original method),
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
        replaceData['old_' + classId + '_' + methodName] = className.prototype[methodName];
    } else {
        replaceData['old_' + methodName] = className.prototype[methodName];
    }
    className.prototype[methodName] = functionToCall;
}

/**
 * Receives a list of metaWindow or metaWindowActor objects, and remove from it
 * our desktop window
 *
 * @param {GList} windowList A list of metaWindow or metaWindowActor objects
 * @returns {GList} The same list, but with the desktop window removed
 */
function removeDesktopWindowFromList(windowList) {

    let returnVal = [];
    for (let element of windowList) {
        let window = element;
        if (window.get_meta_window) { // it is a MetaWindowActor
            window = window.get_meta_window();
        }
        if (!window.customJS_ding || !window.customJS_ding.hideFromWindowList) {
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
    let windowList = replaceData.old_get_tab_list.apply(this, [type, workspace]);
    return removeDesktopWindowFromList(windowList);
};

/**
 * Method replacement for Shell.Global.get_window_actors
 * It removes the desktop window from the list of windows in the Activities mode
 */
function newGetWindowActors() {
    let windowList = replaceData.old_get_window_actors.apply(this, []);
    return removeDesktopWindowFromList(windowList);
}

/**
 * Method replacement for Meta.Workspace.list_windows
 */
function newListWindows() {
    let windowList = replaceData.old_list_windows.apply(this, []);
    return removeDesktopWindowFromList(windowList);
};
