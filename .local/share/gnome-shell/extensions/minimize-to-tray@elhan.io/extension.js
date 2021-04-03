imports.gi.versions.Wnck = '3.0';
var init = (function (Gio2_0, GLib2_0, Clutter6, Meta6, Shell0_1, St1_0, Wnck3_0) {
    'use strict';

    const REQUIRED_PROGRAMS = ['xwininfo', 'xdotool', 'xprop'];
    const getMissingDeps = () => {
        return REQUIRED_PROGRAMS.filter((program) => GLib2_0.find_program_in_path(program) === null);
    };
    const logger = (prefix) => (content) => log(`[mtt] [${prefix}] ${content}`);
    const debug = logger('utils');
    const setTimeout = (func, millis) => {
        return GLib2_0.timeout_add(GLib2_0.PRIORITY_DEFAULT, millis, () => {
            func();
            return false;
        });
    };
    const execute = async (command) => {
        const process = new Gio2_0.Subprocess({
            argv: ['bash', '-c', command],
            flags: Gio2_0.SubprocessFlags.STDOUT_PIPE,
        });
        process.init(null);
        return new Promise((resolve, reject) => {
            process.communicate_utf8_async(null, null, (_, result) => {
                const [, stdout, stderr] = process.communicate_utf8_finish(result);
                if (stderr) {
                    reject(stderr);
                }
                else if (stdout) {
                    resolve(stdout.trim());
                }
                else {
                    resolve();
                }
            });
        });
    };
    /**
     * Taken from pixel saver extension. https://github.com/pixel-saver/pixel-saver
     *
     * Guesses the X ID of a window.
     */
    const guessWindowXID = async (window) => {
        // We cache the result so we don't need to redetect.
        if (!window) {
            return;
        }
        if (window._mttWindowId) {
            return window._mttWindowId;
        }
        /**
         * If window title has non-utf8 characters, get_description() complains
         * "Failed to convert UTF-8 string to JS string: Invalid byte sequence in conversion input",
         * event though get_title() works.
         */
        try {
            const m = window.get_description().match(/0x[0-9a-f]+/);
            if (m && m[0]) {
                window._mttWindowId = m[0];
                return m[0];
            }
        }
        catch (err) {
            debug('failed to get xid from window description, now trying xwininfo');
        }
        // use xwininfo, take first child.
        const act = window.get_compositor_private();
        const xwindow = act && act['x-window'];
        if (xwindow) {
            try {
                const xwininfo = await execute(`xwininfo -children -id 0x${xwindow}`);
                if (xwininfo[0]) {
                    const str = xwininfo[1].toString();
                    /**
                     * The X ID of the window is the one preceding the target window's title.
                     * This is to handle cases where the window has no frame and so
                     * act['x-window'] is actually the X ID we want, not the child.
                     */
                    const regexp = new RegExp(`(0x[0-9a-f]+) +"${window.title}"`);
                    let m = str.match(regexp);
                    if (m && m[1]) {
                        window._mttWindowId = m[1];
                        return m[1];
                    }
                    // Otherwise, just grab the child and hope for the best
                    m = str.split(/child(?:ren)?:/)[1].match(/0x[0-9a-f]+/);
                    if (m && m[0]) {
                        window._mttWindowId = m[0];
                        return m[0];
                    }
                }
            }
            catch (err) {
                debug('failed to get xid from xwininfo, now trying xprop');
            }
        }
        // Try enumerating all available windows and match the title. Note that this
        // may be necessary if the title contains special characters and `x-window`
        // is not available.
        try {
            const result = await execute('xprop -root _NET_CLIENT_LIST');
            if (result[0]) {
                const str = result[1].toString();
                // Get the list of window IDs.
                const windowList = str.match(/0x[0-9a-f]+/g);
                if (windowList) {
                    // For each window ID, check if the title matches the desired title.
                    for (let i = 0; i < windowList.length; ++i) {
                        const result = await execute(`xprop -id "${windowList[i]}" _NET_WM_NAME`);
                        if (result[0]) {
                            const output = result[1].toString();
                            const title = output.match(/_NET_WM_NAME(\(\w+\))? = "(([^\\"]|\\"|\\\\)*)"/);
                            // Is this our guy?
                            if (title && title[2] == window.title) {
                                return windowList[i];
                            }
                        }
                    }
                }
            }
        }
        catch (err) {
            debug('failed to get xid from xprop too. giving up.');
        }
    };

    var ExtensionType;
    (function (ExtensionType) {
        ExtensionType[ExtensionType["SYSTEM"] = 1] = "SYSTEM";
        ExtensionType[ExtensionType["PER_USER"] = 2] = "PER_USER";
    })(ExtensionType || (ExtensionType = {}));
    var ExtensionState;
    (function (ExtensionState) {
        ExtensionState[ExtensionState["ENABLED"] = 1] = "ENABLED";
        ExtensionState[ExtensionState["DISABLED"] = 2] = "DISABLED";
        ExtensionState[ExtensionState["ERROR"] = 3] = "ERROR";
        ExtensionState[ExtensionState["OUT_OF_DATE"] = 4] = "OUT_OF_DATE";
        ExtensionState[ExtensionState["DOWNLOADING"] = 5] = "DOWNLOADING";
        ExtensionState[ExtensionState["INITIALIZED"] = 6] = "INITIALIZED";
        // Used as an error state for operations on unknown extensions,
        // should never be in a real extensionMeta object.
        ExtensionState[ExtensionState["UNINSTALLED"] = 99] = "UNINSTALLED";
    })(ExtensionState || (ExtensionState = {}));
    const getCurrentExtensionSettings = () => imports.misc.extensionUtils.getSettings();

    const { wm } = imports.ui.main;
    const debug$1 = logger('key-manager');
    /**
     * From https://superuser.com/questions/471606/gnome-shell-extension-key-binding
     */
    class KeyManager {
        constructor() {
            this.grabbers = {};
            Shell0_1.Global.get().display.connect('accelerator-activated', (_, action) => {
                this.onAccelerator(action);
            });
        }
        stopListening() {
            Object.keys(this.grabbers).forEach((grabberAction) => {
                const grabber = this.grabbers[grabberAction];
                Shell0_1.Global.get().display.ungrab_accelerator(grabber.action);
                wm.allowKeybinding(grabber.name, Shell0_1.ActionMode.NONE);
            });
        }
        listenFor(accelerator, callback) {
            debug$1(`Trying to listen for hot key [accelerator=${accelerator}]`);
            const action = Shell0_1.Global.get().display.grab_accelerator(accelerator, Meta6.KeyBindingFlags.NONE);
            if (action == Meta6.KeyBindingAction.NONE) {
                debug$1(`Unable to grab accelerator [binding=${accelerator}]`);
            }
            else {
                debug$1(`Grabbed accelerator [action=${action}]`);
                const name = Meta6.external_binding_name_for_action(action);
                debug$1(`Received binding name for action [name=${name}, action=${action}]`);
                wm.allowKeybinding(name, Shell0_1.ActionMode.ALL);
                this.grabbers[action] = {
                    name: name,
                    accelerator: accelerator,
                    callback: callback,
                    action: action,
                };
            }
        }
        onAccelerator(action) {
            const grabber = this.grabbers[action];
            if (grabber) {
                grabber.callback();
            }
            else {
                debug$1(`No listeners [action=${action}]`);
            }
        }
    }

    const { Button } = imports.ui.panelMenu;
    const { panel } = imports.ui.main;
    const debug$2 = logger(_('window-listener'));
    class WindowListener {
        constructor() {
            this.settings = getCurrentExtensionSettings();
            this.keyManager = new KeyManager();
            this.mttData = [];
            this.trackedWindows = [];
            // Initialize values
            this.initValues();
        }
        async enable() {
            await this.initExtensionState();
            // Watch for settings changes
            this.settings.connect('changed::mtt-data', this.onSettingsChanged.bind(this));
            // Check for currently opened windows, if they match our data, we track the window
            const existingWindows = Shell0_1.Global.get().get_window_actors();
            for (let i = 0; i < existingWindows.length; i++) {
                const window = existingWindows[i].get_meta_window();
                if (this.shouldIgnoreWindow(window)) {
                    continue;
                }
                const xid = await guessWindowXID(window);
                if (xid) {
                    await this.trackWindow(xid, window);
                }
            }
            // Watch for window-opened events
            this.windowOpenedListenerId = Shell0_1.Global.get().display.connect('window-created', async (_, window) => {
                if (this.shouldIgnoreWindow(window)) {
                    return;
                }
                const xid = await guessWindowXID(window);
                if (xid) {
                    debug$2(`new window opened for class: ${window.get_id()}/${window.get_wm_class_instance()}`);
                    await this.trackWindow(xid, window);
                }
            });
            // Watch for window-closed events
            this.windowClosedListenerId = Shell0_1.Global.get().window_manager.connect('destroy', async (_, windowActor) => {
                const window = windowActor.get_meta_window();
                if (this.shouldIgnoreWindow(window)) {
                    return;
                }
                const xid = await guessWindowXID(window);
                if (xid) {
                    await this.unTrackWindow(xid);
                    this.settings.set_string('extension-state', JSON.stringify(this.trackedWindows));
                }
            });
            // Watch for window-changed events
            this.windowChangedListenerId = Shell0_1.WindowTracker.get_default().connect('tracked-windows-changed', async () => {
                const existingWindows = Shell0_1.Global.get().get_window_actors();
                for (let i = 0; i < existingWindows.length; i++) {
                    const window = existingWindows[i].get_meta_window();
                    if (this.shouldIgnoreWindow(window)) {
                        continue;
                    }
                    const xid = await guessWindowXID(window);
                    if (xid) {
                        await this.trackWindow(xid, window);
                    }
                }
            });
            // Watch for window-minimized events
            this.windowMinimizedListenerId = Shell0_1.Global.get().window_manager.connect('minimize', async (_, windowActor) => {
                const window = windowActor.get_meta_window();
                if (this.shouldIgnoreWindow(window)) {
                    return;
                }
                const xid = await guessWindowXID(window);
                if (xid) {
                    const trackedWindow = this.trackedWindows.find((trackedWindow) => trackedWindow.xid === xid);
                    if (trackedWindow) {
                        this.hideWindow(xid);
                        debug$2(`window is minimized for class: ${xid}/${window.get_wm_class_instance()}`);
                    }
                }
            });
            // Rebind keyboard shortcuts
            this.rebindShortcuts();
            debug$2('started listening for windows');
        }
        disable() {
            // Dont watch for window-opened event anymore
            if (this.windowOpenedListenerId != undefined) {
                Shell0_1.Global.get().display.disconnect(this.windowOpenedListenerId);
                this.windowOpenedListenerId = undefined;
            }
            // Dont watch for window-closed event anymore
            if (this.windowClosedListenerId != undefined) {
                Shell0_1.Global.get().window_manager.disconnect(this.windowClosedListenerId);
                this.windowClosedListenerId = undefined;
            }
            // Dont watch for windows-changed event anymore
            if (this.windowChangedListenerId != undefined) {
                Shell0_1.WindowTracker.get_default().disconnect(this.windowChangedListenerId);
                this.windowChangedListenerId = undefined;
            }
            // Dont watch for windows-minimized event anymore
            if (this.windowMinimizedListenerId != undefined) {
                Shell0_1.Global.get().window_manager.disconnect(this.windowMinimizedListenerId);
                this.windowMinimizedListenerId = undefined;
            }
            // Save the state
            this.settings.set_string('extension-state', JSON.stringify(this.trackedWindows));
            // Untrack windows
            this.trackedWindows.forEach((trackedWindow) => this.unTrackWindow(trackedWindow.xid));
            debug$2('stopped listening for windows');
        }
        shouldIgnoreWindow(window) {
            return !window || !window.get_wm_class_instance() || window.get_window_type() != Meta6.WindowType.NORMAL;
        }
        async initExtensionState() {
            try {
                const oldState = JSON.parse(this.settings.get_string('extension-state'));
                await new Promise((resolve) => setTimeout(resolve, 200));
                for (let i = 0; i < oldState.length; i++) {
                    const oldWindowState = oldState[i];
                    const window = await this.getWindow(oldWindowState.xid);
                    if (!window || this.shouldIgnoreWindow(window)) {
                        continue;
                    }
                    debug$2(`restoring window: ${JSON.stringify(oldWindowState)}`);
                    await this.trackWindow(oldWindowState.xid, window);
                    if (oldWindowState.hidden) {
                        this.hideWindow(oldWindowState.xid);
                    }
                    else {
                        this.showWindow(oldWindowState.xid);
                    }
                }
            }
            catch (ex) {
                debug$2(`failed to parse initial state: ${ex}`);
            }
        }
        initValues() {
            try {
                // Get the already saved data
                this.mttData = JSON.parse(this.settings.get_string('mtt-data'));
            }
            catch (_) {
                debug$2('could not parse the settings data, resetting it.');
                this.mttData = [];
            }
        }
        async trackWindow(xid, metaWindow) {
            // Get the class name
            const className = metaWindow.get_wm_class_instance();
            if (className == null) {
                debug$2(`className is null for xid: ${xid}`);
                return;
            }
            // Get the mtt infor from the data
            const mttInfo = this.mttData.find((data) => data.className === className);
            // Check if we have the class name in our mtt data
            if (mttInfo && mttInfo.enabled && this.trackedWindows.findIndex((trackedWindow) => trackedWindow.xid == xid) < 0) {
                // Find the app from pid
                const app = Shell0_1.WindowTracker.get_default().get_window_app(metaWindow);
                if (app == null) {
                    debug$2(`app is null for xid/className: ${xid}/${className}`);
                    return;
                }
                // Get the icon
                const icon = app.create_icon_texture(16);
                this.addTray(xid, icon);
                // Add window info to tracked windows
                this.trackedWindows = [
                    ...this.trackedWindows,
                    {
                        hidden: mttInfo.startHidden,
                        className,
                        xid,
                        lastUpdatedAt: new Date(),
                    },
                ];
                // Check if start hidden flag is set
                if (mttInfo.startHidden) {
                    debug$2(`start hidden flag is set for ${mttInfo.className}. Hiding it.`);
                    setTimeout(() => this.hideWindow(xid), 500);
                }
                this.settings.set_string('extension-state', JSON.stringify(this.trackedWindows));
            }
        }
        async unTrackWindow(xid) {
            // Get the tracked window
            const trackedWindow = this.trackedWindows.find((trackedWindow) => trackedWindow.xid === xid);
            // Check if tracked window exist
            if (trackedWindow) {
                debug$2(`tracked window is closed: ${JSON.stringify(trackedWindow)}`);
                const window = await this.getWindow(xid);
                if (window && trackedWindow.hidden == true) {
                    this.showWindow(trackedWindow.xid);
                }
                this.removeTray(xid);
                this.trackedWindows = this.trackedWindows.filter((trackedWindow) => trackedWindow.xid !== xid);
            }
        }
        async onSettingsChanged() {
            // Load mtt state from settings
            this.initValues();
            // Find currently tracked window classes
            const trackedClassNames = this.mttData
                .filter((mttInfo) => mttInfo.enabled === true)
                .map((mttInfo) => mttInfo.className);
            // Get the removed windows from tracked classnames
            const nonExistingWindows = this.trackedWindows.filter((trackedWindow) => trackedClassNames.indexOf(trackedWindow.className) < 0);
            // Untrack them
            for (let i = 0; i < nonExistingWindows.length; i++) {
                const window = nonExistingWindows[i];
                await this.unTrackWindow(window.xid);
            }
            // Track the new windows
            const existingWindows = Shell0_1.Global.get().get_window_actors();
            for (let i = 0; i < existingWindows.length; i++) {
                const window = existingWindows[i].get_meta_window();
                if (this.shouldIgnoreWindow(window)) {
                    continue;
                }
                const xid = await guessWindowXID(window);
                if (xid) {
                    await this.trackWindow(xid, window);
                }
            }
            // Rebind keyboard shortcuts
            this.rebindShortcuts();
        }
        rebindShortcuts() {
            // Stop old listeners
            this.keyManager.stopListening();
            // For each new className, create keybinding
            this.mttData.forEach((mttInfo) => {
                // Check if keyboard shortcut is assigned
                if (mttInfo.enabled && mttInfo.keybinding && mttInfo.keybinding.length > 0) {
                    try {
                        this.keyManager.listenFor(mttInfo.keybinding.join(''), () => {
                            const windows = this.trackedWindows.filter((trackedWindow) => trackedWindow.className === mttInfo.className);
                            if (windows.length > 0) {
                                const windowTobeToggled = windows
                                    .slice()
                                    .sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime())[0];
                                if (windowTobeToggled.hidden == true) {
                                    this.showWindow(windowTobeToggled.xid);
                                }
                                else {
                                    this.hideWindow(windowTobeToggled.xid);
                                }
                            }
                        });
                    }
                    catch (ex) {
                        debug$2('failed to add keybinding');
                    }
                }
            });
        }
        addTray(xid, icon) {
            // Create a new button from given window id
            const newButton = new Button(0, xid);
            const iconBox = new St1_0.Bin({
                style_class: 'system-status-icon',
                y_align: Clutter6.ActorAlign.CENTER,
            });
            iconBox.set_child(icon);
            newButton.add_actor(iconBox);
            // Connect to click event for hiding/showing
            newButton.connect('button-press-event', () => {
                // Get the tracked window
                const trackedWindow = this.trackedWindows.find((trackedWindow) => trackedWindow.xid === xid);
                // Check if tracked window exist
                if (trackedWindow) {
                    // If window is hiden, show it else hide it
                    if (trackedWindow.hidden) {
                        this.showWindow(trackedWindow.xid);
                    }
                    else {
                        this.hideWindow(trackedWindow.xid);
                    }
                    this.settings.set_string('extension-state', JSON.stringify(this.trackedWindows));
                }
            });
            // Add actor to status area
            panel.addToStatusArea(xid, newButton);
            return newButton;
        }
        removeTray(xid) {
            // If actor exists in status area, destroy it
            if (panel.statusArea[xid]) {
                panel.statusArea[xid].destroy();
            }
        }
        hideWindow(xid) {
            var _a;
            // Get the window for given id
            const window = this.trackedWindows.find((mttWindow) => mttWindow.xid === xid);
            // Do nothing if window does not exists
            if (window == null) {
                return;
            }
            // Hide the window from user
            debug$2(`hiding window: ${window.xid}/${window.className}`);
            (_a = Wnck3_0.Screen.get_default()) === null || _a === void 0 ? void 0 : _a.force_update();
            const wnckWindow = Wnck3_0.Window.get(parseInt(xid));
            if (wnckWindow) {
                wnckWindow.set_skip_pager(true);
                wnckWindow.set_skip_tasklist(true);
                wnckWindow.minimize();
                window.hidden = true;
                window.lastUpdatedAt = new Date();
            }
        }
        showWindow(xid) {
            var _a;
            // Get the window for given id
            const window = this.trackedWindows.find((mttWindow) => mttWindow.xid === xid);
            // Do nothing if window does not exists
            if (window == null) {
                return;
            }
            // Show the window to user
            debug$2(`showing window: ${window.xid}/${window.className}`);
            (_a = Wnck3_0.Screen.get_default()) === null || _a === void 0 ? void 0 : _a.force_update();
            const wnckWindow = Wnck3_0.Window.get(parseInt(xid));
            if (wnckWindow) {
                wnckWindow.set_skip_pager(false);
                wnckWindow.set_skip_tasklist(false);
                wnckWindow.unminimize(Math.floor(Date.now() / 1000));
                window.hidden = false;
                window.lastUpdatedAt = new Date();
            }
        }
        async getWindow(xid) {
            const currentWindowsActors = Shell0_1.Global.get().get_window_actors();
            for (let i = 0; i < currentWindowsActors.length; i++) {
                const currentWindow = currentWindowsActors[i].get_meta_window();
                if (this.shouldIgnoreWindow(currentWindow)) {
                    continue;
                }
                const currentXid = await guessWindowXID(currentWindow);
                if (currentXid === xid) {
                    return currentWindow;
                }
            }
        }
    }

    const debug$3 = logger('extension');
    class MttExtension {
        constructor() {
            const missingDeps = getMissingDeps();
            if (missingDeps.length > 0) {
                debug$3(`Failed to enable minimize-to-tray extension. ${missingDeps.join(', ')} application/s are not installed`);
                throw new Error(`Failed to enable minimize-to-tray. ${missingDeps.join(', ')} application/s are not installed`);
            }
            this.listener = new WindowListener();
            debug$3('extension is initialized');
        }
        enable() {
            this.listener.enable();
            debug$3('extension is enabled');
        }
        disable() {
            this.listener.disable();
            debug$3('extension is disabled');
        }
    }
    function extension () {
        return new MttExtension();
    }

    return extension;

}(imports.gi.Gio, imports.gi.GLib, imports.gi.Clutter, imports.gi.Meta, imports.gi.Shell, imports.gi.St, imports.gi.Wnck));
