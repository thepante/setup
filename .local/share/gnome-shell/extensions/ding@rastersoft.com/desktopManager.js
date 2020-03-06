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
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;

const FileItem = imports.fileItem;
const DesktopGrid = imports.desktopGrid;
const DesktopIconsUtil = imports.desktopIconsUtil;
const Prefs = imports.preferences;
const Enums = imports.enums;
const DBusUtils = imports.dbusUtils;
const AskNamePopup = imports.askNamePopup;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var DesktopManager = class {
    constructor(appUuid, desktopList, scale, codePath, asDesktop) {

        Gtk.init(null);
        DBusUtils.init();
        this._asDesktop = asDesktop;
        this._desktopList = desktopList;
        this._appUuid = appUuid;
        this._scale = scale;
        this._desktopFilesChanged = false;
        this._readingDesktopFiles = true;
        this._desktopDir = DesktopIconsUtil.getDesktopDir();
        this._updateWritableByOthers();
        this._monitorDesktopDir = this._desktopDir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorDesktopDir.set_rate_limit(1000);
        this._monitorDesktopDir.connect('changed', (obj, file, otherFile, eventType) => this._updateDesktopIfChanged(file, otherFile, eventType));
        this._settingsId = Prefs.desktopSettings.connect('changed', (obj, key) => {
            if (key == 'icon-size') {
                this._removeAllFilesFromGrids();
                this._createGrids();
            }
            this._updateDesktop();
        });
        this._gtkSettingsId = Prefs.gtkSettings.connect('changed', (obj, key) => {
            if (key == 'show-hidden') {
                this._updateDesktop();
            }
        });

        this._rubberBand = false;

        let cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_file(Gio.File.new_for_path(GLib.build_filenamev([codePath, "stylesheet.css"])));
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), cssProvider, 600);

        this._configureSelectionColor();

        this._x1 = desktopList[0].x;
        this._x2 = desktopList[0].x + desktopList[0].w;
        this._y1 = desktopList[0].y;
        this._y2 = desktopList[0].y + desktopList[0].h;
        for(let desktop of desktopList) {
            if (this._x1 > desktop.x) {
                this._x1 = desktop.x;
            }
            if (this._y1 > desktop.y) {
                this._y1 = desktop.y;
            }
            if (this._x2 < (desktop.x + desktop.w)) {
                this._x2 = desktop.x + desktop.w;
            }
            if (this._y2 < (desktop.y + desktop.h)) {
                this._y2 = desktop.y + desktop.h;
            }
        }

        this._window = new Gtk.Window();
        if (asDesktop) {
            if (appUuid) {
                this._window.set_title(appUuid);
            }
            this._window.set_decorated(false);
            this._window.set_deletable(false);
            // If we are under X11, manage everything from here
            if (Gdk.Display.get_default().constructor.$gtype.name === 'GdkX11Display') {
                this._window.set_type_hint(Gdk.WindowTypeHint.DESKTOP);
                this._window.stick();
                this._window.move(this._x1, this._y1);
            }
        } else {
            this._window.set_title('Desktop Icons');
        }
        this._window.set_resizable(false);
        this._window.connect('delete-event', () => {
            if (this._asDesktop) {
                // Do not destroy window when closing if the instance is working as desktop
                return true;
            } else {
                // Exit if this instance is working as an stand-alone window
                Gtk.main_quit();
            }
        });

        this._eventBox = new Gtk.EventBox({ visible: true });
        this._window.add(this._eventBox);
        this._container = new Gtk.Fixed();
        this._eventBox.add(this._container);

        this.setDropDestination(this._eventBox);

        this._window.set_app_paintable(true);
        // Transparent background, but only if this instance is working as desktop
        if (asDesktop) {
            let screen = this._window.get_screen();
            let visual = screen.get_rgba_visual();
            if (visual && screen.is_composited()) {
                this._window.set_visual(visual);
                this._window.connect('draw', (widget, cr) => {
                    Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: 0.0, green: 0.0, blue: 0.0, alpha: 0.0}));
                    cr.paint();
                    return false;
                });
            }
        }
        this._container.connect('draw', (widget, cr) => {
            if (!this._asDesktop) {
                let colorNumber = 0;
                for(let desktop of desktopList) {
                    colorNumber++;
                    if (colorNumber > 7) {
                        colorNumber = 1; // avoid black
                    }
                    Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: (colorNumber&0x02) ? 1.0 : 0.0,
                                                            green: (colorNumber&0x04) ? 1.0 : 0.0,
                                                            blue: (colorNumber&0x01) ? 1.0 : 0.0,
                                                            alpha: 1.0}));
                    cr.rectangle(desktop.x - this._x1, desktop.y - this._y1, desktop.w, desktop.h);
                    cr.fill();
                }
            }
            this._doDrawRubberBand(cr);
        });
        this._createGrids();

        this._window.show_all();
        this._window.set_size_request(this._x2 - this._x1, this._y2 - this._y1);
        this._window.resize(this._x2 - this._x1, this._y2 - this._y1);
        this._eventBox.add_events(Gdk.EventMask.BUTTON_MOTION_MASK |
                                  Gdk.EventMask.BUTTON_PRESS_MASK |
                                  Gdk.EventMask.BUTTON_RELEASE_MASK |
                                  Gdk.EventMask.KEY_RELEASE_MASK);
        this._eventBox.connect('button-press-event', (actor, event) => this._onPressButton(actor, event));
        this._eventBox.connect('motion-notify-event', (actor, event) => this._onMotion(actor, event));
        this._eventBox.connect('button-release-event', (actor, event) => this._onReleaseButton(actor, event));
        this._window.connect('key-release-event', (actor, event) => this._onKeyPress(actor, event));
        this._eventBox.connect('drag-motion', (widget, context, x, y) => {
            this._xDestination = x;
            this._yDestination = y;
        });
        this._createDesktopBackgroundMenu();
        DBusUtils.NautilusFileOperationsProxy.connect('g-properties-changed', this._undoStatusChanged.bind(this));
        this._fileList = [];
        this._readFileList();
    }

    _createGrids() {
        this._desktops = [];
        for(let desktop of this._desktopList) {
            this._desktops.push(new DesktopGrid.DesktopGrid(this, this._container, desktop.x, desktop.y, desktop.w, desktop.h, this._x1, this._y1, this._scale));
        }
    }

    _doDrawRubberBand(cr) {
        if (this._rubberBand) {
            cr.rectangle(this._rubberBandInitX,
                         this._rubberBandInitY,
                         this._mouseX - this._rubberBandInitX,
                         this._mouseY - this._rubberBandInitY);
            Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({
                                                        red: this._selectColor.red,
                                                        green: this._selectColor.green,
                                                        blue: this._selectColor.blue,
                                                        alpha: 0.6}));
            cr.fill();
        }
    }

    _configureSelectionColor() {
        this._contextWidget = new Gtk.WidgetPath();
        this._contextWidget.append_type(Gtk.Widget);

        this._styleContext = new Gtk.StyleContext();
        this._styleContext.set_path(this._contextWidget);
        this._styleContext.add_class('view');
        this._cssProviderSelection = new Gtk.CssProvider();
        this._styleContext.connect('changed', () => {
            Gtk.StyleContext.remove_provider_for_screen(Gdk.Screen.get_default(), this._cssProviderSelection);
            this._setSelectionColor();
        });
        this._setSelectionColor();
    }

    _setSelectionColor() {
        this._selectColor = this._styleContext.get_background_color(Gtk.StateFlags.SELECTED);
        let style = `.desktop-icons-selected {
            background-color: rgba(${this._selectColor.red * 255},${this._selectColor.green * 255}, ${this._selectColor.blue * 255}, 0.6);
        }`;
        this._cssProviderSelection.load_from_data(style);
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), this._cssProviderSelection, 600);
    }

    clearFileCoordinates(fileList, dropCoordinates) {
        for(let element of fileList) {
            let file = Gio.File.new_for_uri(element);
            if (!file.is_native() || !file.query_exists(null)) {
                continue;
            }
            let info = new Gio.FileInfo();
            info.set_attribute_string('metadata::nautilus-icon-position', '');
            if (dropCoordinates != null) {
                info.set_attribute_string('metadata::nautilus-drop-position', dropCoordinates);
            }
            try {
                file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
            } catch(e) {}
        }
    }

    setDropDestination(dropDestination) {
        dropDestination.drag_dest_set(Gtk.DestDefaults.ALL, null, Gdk.DragAction.MOVE);
        let targets = new Gtk.TargetList(null);
        targets.add(Gdk.atom_intern('x-special/ding-icon-list', false), Gtk.TargetFlags.SAME_APP, 0);
        targets.add(Gdk.atom_intern('x-special/gnome-icon-list', false), 0, 1);
        targets.add(Gdk.atom_intern('text/uri-list', false), 0, 2);
        dropDestination.drag_dest_set_target_list(targets);
        dropDestination.connect('drag-data-received', (widget, context, x, y, selection, info, time) => {
            if ((info == 1) || (info == 2)) {
                let fileList = DesktopIconsUtil.getFilesFromNautilusDnD(selection, info);
                if (fileList.length != 0) {
                    this.clearFileCoordinates(fileList, `${x},${y}`);
                    DBusUtils.NautilusFileOperationsProxy.MoveURIsRemote(
                        fileList,
                        "file://" + GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
                        (result, error) => {
                            if (error)
                                throw new Error('Error moving files: ' + error.message);
                            }
                    );
                }
            }
        });
    }

    fillDragDataGet(info) {
        let fileList = this.getCurrentSelection(false);
        if (fileList == null) {
            return null;
        }
        let atom;
        switch(info) {
            case 1:
                atom = Gdk.atom_intern('x-special/gnome-icon-list', false);
            break;
            case 2:
                atom = Gdk.atom_intern('text/uri-list', false);
            break;
            default:
                return null;
        }
        let data = "";
        for (let fileItem of fileList) {
            data += fileItem.uri;
            if (info == 1) {
                let coordinates = fileItem.getCoordinates();
                if (coordinates != null) {
                    data += `\r${coordinates[0]}:${coordinates[1]}:${coordinates[2] - coordinates[0] + 1}:${coordinates[3] - coordinates[1] + 1}`
                }
            }
            data += '\r\n';
        }
        return [atom, data];
    }

    _onPressButton(actor, event) {
        let button = event.get_button()[1];
        let [a, x, y] = event.get_coords();
        let state = event.get_state()[1];

        if (button == 1) {
            let shiftPressed = !!(state & Gdk.ModifierType.SHIFT_MASK);
            let controlPressed = !!(state & Gdk.ModifierType.CONTROL_MASK);
            if (!shiftPressed && !controlPressed) {
                // clear selection
                for(let item of this._fileList) {
                    item.unsetSelected();
                }
            }
            this._startRubberband(x, y);
        }

        if (button == 3) {
            this._menu.popup_at_pointer(event);
            this._syncUndoRedo();
            let atom = Gdk.Atom.intern('CLIPBOARD', false);
            let clipboard = Gtk.Clipboard.get(atom);
            clipboard.request_text((clipboard, text) => {
                let [valid, is_cut, files] = this._parseClipboardText(text);
                this._pasteMenuItem.set_sensitive(valid);
            });
        }

        return false;
    }

    _syncUndoRedo() {
        switch (DBusUtils.NautilusFileOperationsProxy.UndoStatus) {
            case Enums.UndoStatus.UNDO:
                this._undoMenuItem.show();
                this._redoMenuItem.hide();
                break;
            case Enums.UndoStatus.REDO:
                this._undoMenuItem.hide();
                this._redoMenuItem.show();
                break;
            default:
                this._undoMenuItem.hide();
                this._redoMenuItem.hide();
                break;
        }
    }

    _undoStatusChanged(proxy, properties, test) {
        if ('UndoStatus' in properties.deep_unpack())
            this._syncUndoRedo();
    }

    _doUndo() {
        DBusUtils.NautilusFileOperationsProxy.UndoRemote(
            (result, error) => {
                if (error)
                    throw new Error('Error performing undo: ' + error.message);
            }
        );
    }

    _doRedo() {
        DBusUtils.NautilusFileOperationsProxy.RedoRemote(
            (result, error) => {
                if (error)
                    throw new Error('Error performing redo: ' + error.message);
            }
        );
    }

    _onKeyPress(actor, event) {
        let symbol = event.get_keyval()[1];
        let isCtrl = (event.get_state()[1] & Gdk.ModifierType.CONTROL_MASK) != 0;
        let isShift = (event.get_state()[1] & Gdk.ModifierType.SHIFT_MASK) != 0;
        if (isCtrl && isShift && ((symbol == Gdk.KEY_Z) || (symbol == Gdk.KEY_z))) {
            this._doRedo();
            return true;
        } else if (isCtrl && ((symbol == Gdk.KEY_Z) || (symbol == Gdk.KEY_z))) {
            this._doUndo();
            return true;
        } else if (isCtrl && ((symbol == Gdk.KEY_C) || (symbol == Gdk.KEY_c))) {
            this.doCopy();
            return true;
        } else if (isCtrl && ((symbol == Gdk.KEY_X) || (symbol == Gdk.KEY_x))) {
            this.doCut();
            return true;
        } else if (isCtrl && ((symbol == Gdk.KEY_V) || (symbol == Gdk.KEY_v))) {
            this._doPaste();
            return true;
        } else if (symbol == Gdk.KEY_Return) {
            let selection = this.getCurrentSelection(false);
            if (selection && (selection.length == 1)) {
                selection[0].doOpen();
                return true;
            }
        } else if (symbol == Gdk.KEY_Delete) {
            this.doTrash();
            return true;
        } else if (symbol == Gdk.KEY_F2) {
            let selection = this.getCurrentSelection(false);
            if (selection && (selection.length == 1)) {
                // Support renaming other grids file items.
                this.doRename(selection[0]);
                return true;
            }
        }
        return false;
    }

    _createDesktopBackgroundMenu() {
        this._menu = new Gtk.Menu();
        let newFolder = new Gtk.MenuItem({label: _("New Folder")});
        newFolder.connect("activate", () => this._newFolder());
        this._menu.add(newFolder);

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._pasteMenuItem = new Gtk.MenuItem({label: _("Paste")});
        this._pasteMenuItem.connect("activate", () => this._doPaste());
        this._menu.add(this._pasteMenuItem);

        this._undoMenuItem = new Gtk.MenuItem({label: _("Undo")});
        this._undoMenuItem.connect("activate", () => this._doUndo());
        this._menu.add(this._undoMenuItem);

        this._redoMenuItem = new Gtk.MenuItem({label: _("Redo")});
        this._redoMenuItem.connect("activate", () => this._doRedo());
        this._menu.add(this._redoMenuItem);

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._showDesktopInFilesMenuItem = new Gtk.MenuItem({label: _("Show Desktop in Files")});
        this._showDesktopInFilesMenuItem.connect("activate", () => this._onOpenDesktopInFilesClicked());
        this._menu.add(this._showDesktopInFilesMenuItem);

        this._openTerminalMenuItem = new Gtk.MenuItem({label: _("Open in Terminal")});
        this._openTerminalMenuItem.connect("activate", () => this._onOpenTerminalClicked());
        this._menu.add(this._openTerminalMenuItem);

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._changeBackgroundMenuItem = new Gtk.MenuItem({label: _("Change Background…")});
        this._changeBackgroundMenuItem.connect("activate", () => {
            let desktopFile = Gio.DesktopAppInfo.new('gnome-background-panel.desktop');
            desktopFile.launch([], null);
        });
        this._menu.add(this._changeBackgroundMenuItem);

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._displaySettingsMenuItem = new Gtk.MenuItem({label: _("Display Settings")});
        this._displaySettingsMenuItem.connect("activate", () => {
            let desktopFile = Gio.DesktopAppInfo.new('gnome-display-panel.desktop');
            desktopFile.launch([], null);
        });
        this._menu.add(this._displaySettingsMenuItem);

        this._settingsMenuItem = new Gtk.MenuItem({label: _("Settings")});
        this._settingsMenuItem.connect("activate", () => Prefs.showPreferences());
        this._menu.add(this._settingsMenuItem);
        this._menu.show_all();
    }

    _onOpenDesktopInFilesClicked() {
        Gio.AppInfo.launch_default_for_uri_async(this._desktopDir.get_uri(),
            null, null,
            (source, result) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(result);
                } catch (e) {
                   log('Error opening Desktop in Files: ' + e.message);
                }
            }
        );
    }

    _onOpenTerminalClicked() {
        let desktopPath = this._desktopDir.get_path();
        DesktopIconsUtil.launchTerminal(desktopPath);
    }

    _doPaste() {
        let atom = Gdk.Atom.intern('CLIPBOARD', false);
        let clipboard = Gtk.Clipboard.get(atom);
        clipboard.request_text((clipboard, text) => {
            let [valid, is_cut, files] = this._parseClipboardText(text);
            if (!valid) {
                return;
            }

            let desktopDir = this._desktopDir.get_uri();
            if (is_cut) {
                DBusUtils.NautilusFileOperationsProxy.MoveURIsRemote(files, desktopDir,
                    (result, error) => {
                        if (error)
                            throw new Error('Error moving files: ' + error.message);
                    }
                );
            } else {
                DBusUtils.NautilusFileOperationsProxy.CopyURIsRemote(files, desktopDir,
                    (result, error) => {
                        if (error)
                            throw new Error('Error copying files: ' + error.message);
                    }
                );
            }
        });
    }

    _parseClipboardText(text) {
        if (text === null)
            return [false, false, null];

        let lines = text.split('\n');
        let [mime, action, ...files] = lines;

        if (mime != 'x-special/nautilus-clipboard')
            return [false, false, null];

        if (!(['copy', 'cut'].includes(action)))
            return [false, false, null];
        let isCut = action == 'cut';

        /* Last line is empty due to the split */
        if (files.length <= 1)
            return [false, false, null];
        /* Remove last line */
        files.pop();

        return [true, isCut, files];
    }

    _onMotion(actor, event) {
        if (this._rubberBand) {
            let [a, x, y] = event.get_coords();
            this._mouseX = x;
            this._mouseY = y;
            this._window.queue_draw();
            let x1 = Math.min(x, this._rubberBandInitX);
            let x2 = Math.max(x, this._rubberBandInitX);
            let y1 = Math.min(y, this._rubberBandInitY);
            let y2 = Math.max(y, this._rubberBandInitY);
            for(let item of this._fileList) {
                item.updateRubberband(x1, y1, x2, y2);
            }
        }
        return false;
    }

    _onReleaseButton(actor, event) {
        if (this._rubberBand) {
            this._rubberBand = false;
            for(let item of this._fileList) {
                item.endRubberband();
            }
        }
        this._window.queue_draw();
        return false;
    }

    _startRubberband(x, y) {
        this._rubberBandInitX = x;
        this._rubberBandInitY = y;
        this._mouseX = x;
        this._mouseY = y;
        this._rubberBand = true;
        for(let item of this._fileList) {
            item.startRubberband(x, y);
        }
    }

    selected(fileItem, action) {
        switch(action) {
        case Enums.Selection.ALONE:
            if (!fileItem.isSelected) {
                for(let item of this._fileList) {
                    if (item === fileItem) {
                        item.setSelected();
                    } else {
                        item.unsetSelected();
                    }
                }
            }
            break;
        case Enums.Selection.WITH_SHIFT:
            fileItem.toggleSelected();
            break;
        case Enums.Selection.RIGHT_BUTTON:
            if (!fileItem.isSelected) {
                for(let item of this._fileList) {
                    if (item === fileItem) {
                        item.setSelected();
                    } else {
                        item.unsetSelected();
                    }
                }
            }
            break;
        case Enums.Selection.ENTER:
            if (this._rubberBand) {
                fileItem.setSelected();
            }
            break;
        case Enums.Selection.RELEASE:
            for(let item of this._fileList) {
                if (item === fileItem) {
                    item.setSelected();
                } else {
                    item.unsetSelected();
                }
            }
            break;
        }
    }

    _removeAllFilesFromGrids() {
        for(let fileItem of this._fileList) {
            fileItem.removeFromGrid();
        }
        this._fileList = [];
    }

    _readFileList() {
        this._readingDesktopFiles = true;
        this._removeAllFilesFromGrids();

        this._desktopFilesChanged = false;
        if (this._desktopEnumerateCancellable)
            this._desktopEnumerateCancellable.cancel();

        this._desktopEnumerateCancellable = new Gio.Cancellable();
        this._desktopDir.enumerate_children_async(
            Enums.DEFAULT_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            this._desktopEnumerateCancellable,
            (source, result) => {
                try {
                    let fileEnum = source.enumerate_children_finish(result);
                    if (!this._desktopFilesChanged) {
                        // if no file changed while reading the desktop folder, the fileItems list if right
                        this._readingDesktopFiles = false;
                        for (let [newFolder, extras] of DesktopIconsUtil.getExtraFolders()) {
                            this._fileList.push(
                                new FileItem.FileItem(
                                    this,
                                    newFolder,
                                    newFolder.query_info(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null),
                                    extras,
                                    this._scale
                                )
                            );
                        }
                        let info;
                        let showHidden = Prefs.gtkSettings.get_boolean('show-hidden');
                        while ((info = fileEnum.next_file(null))) {
                            let fileItem = new FileItem.FileItem(
                                this,
                                fileEnum.get_child(info),
                                info,
                                Enums.FileType.NONE,
                                this._scale
                            );
                            if (fileItem.isHidden && !showHidden) {
                                /* if there are hidden files in the desktop and the user doesn't want to
                                   show them, remove the coordinates. This ensures that if the user enables
                                   showing them, they won't fight with other icons for the same place
                                */
                                if (fileItem.savedCoordinates) {
                                    // only overwrite them if needed
                                    fileItem.savedCoordinates = null;
                                }
                                continue;
                            }
                            this._fileList.push(fileItem);
                        }
                        this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.PRESERVE);
                    } else {
                        // But if there was a file change, we must re-read it to be sure that the list is complete
                        this._readFileList();
                    }
                } catch(e) {
                    print("Error reading the desktop. Retrying..." + e);
                    Gtk.main_quit();
                }
            }
        );
    }

    _addFilesToDesktop(fileList, storeMode) {
        let outOfDesktops = [];
        let notAssignedYet = [];
        // First, add those icons that fit in the current desktops
        for(let fileItem of fileList) {
            if (fileItem.savedCoordinates == null) {
                notAssignedYet.push(fileItem);
                continue;
            }
            if (fileItem.dropCoordinates != null) {
                fileItem.dropCoordinates = null;
            }
            let [itemX, itemY] = fileItem.savedCoordinates;
            let addedToDesktop = false;
            for(let desktop of this._desktops) {
                if (desktop.getDistance(itemX, itemY) == 0) {
                    addedToDesktop = true;
                    desktop.addFileItemCloseTo(fileItem, itemX, itemY, storeMode);
                    break;
                }
            }
            if (!addedToDesktop) {
                outOfDesktops.push(fileItem);
            }
        }
        // Now, assign those icons that are outside the current desktops,
        // but have assigned coordinates
        for(let fileItem of outOfDesktops) {
            let minDistance = -1;
            let [itemX, itemY] = fileItem.savedCoordinates;
            let newDesktop = null;
            for (let desktop of this._desktops) {
                let distance = desktop.getDistance(itemX, itemY);
                if (distance == -1) {
                    continue;
                }
                if ((minDistance == -1) || (distance < minDistance)) {
                    minDistance = distance;
                    newDesktop = desktop;
                }
            }
            if (newDesktop == null) {
                print("Not enough space to add icons");
                break;
            } else {
                newDesktop.addFileItemCloseTo(fileItem, itemX, itemY, storeMode);
            }
        }
        // Finally, assign those icons that still don't have coordinates
        for (let fileItem of notAssignedYet) {
            let x, y;
            if (fileItem.dropCoordinates == null) {
                x = 0;
                y = 0;
                storeMode = Enums.StoredCoordinates.ASSIGN;
            } else {
                [x, y] = fileItem.dropCoordinates;
                fileItem.dropCoordinates = null;
                storeMode = Enums.StoredCoordinates.OVERWRITE;
            }
            for (let desktop of this._desktops) {
                let distance = desktop.getDistance(x, y);
                if (distance != -1) {
                    desktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                    break;
                }
            }
        }
    }

    _updateWritableByOthers() {
        let info = this._desktopDir.query_info(Gio.FILE_ATTRIBUTE_UNIX_MODE,
                                               Gio.FileQueryInfoFlags.NONE,
                                               null);
        this.unixMode = info.get_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE);
        let writableByOthers = (this.unixMode & Enums.S_IWOTH) != 0;
        if (writableByOthers != this.writableByOthers) {
            this.writableByOthers = writableByOthers;
            if (this.writableByOthers) {
                print(`desktop-icons: Desktop is writable by others - will not allow launching any desktop files`);
            }
            return true;
        } else {
            return false;
        }
    }

    _updateDesktop() {
        if (this._readingDesktopFiles) {
            // just notify that the files changed while being read from the disk.
            this._desktopFilesChanged = true;
        } else {
            this._readFileList();
        }
    }

    _updateDesktopIfChanged(file, otherFile, eventType) {
        if (this._readingDesktopFiles) {
            // just notify that the files changed while being read from the disk.
            this._desktopFilesChanged = true;
            return;
        }
        switch(eventType) {
            case Gio.FileMonitorEvent.MOVED_IN:
                /* Remove the coordinates that could exist to avoid conflicts between
                   files that are already in the desktop and the new one
                */
                let info = new Gio.FileInfo();
                info.set_attribute_string('metadata::nautilus-icon-position', '');
                file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
                break;
            case Gio.FileMonitorEvent.ATTRIBUTE_CHANGED:
                /* The desktop is what changed, and not a file inside it */
                if (file.get_uri() == this._desktopDir.get_uri()) {
                    if (this._updateWritableByOthers()) {
                        this._readFileList();
                    }
                    return;
                }
                break;
        }
        this._readFileList();
    }

    _getClipboardText(isCopy) {
        let selection = this.getCurrentSelection(true);
        if (selection) {
            let atom = Gdk.Atom.intern('CLIPBOARD', false);
            let clipboard = Gtk.Clipboard.get(atom);
            let text = 'x-special/nautilus-clipboard\n' + (isCopy ? 'copy' : 'cut') + '\n';
            for (let item of selection) {
                text += item + '\n';
            }
            clipboard.set_text(text, -1);
        }
    }

    doCopy() {
        this._getClipboardText(true);
    }

    doCut() {
        this._getClipboardText(false);
    }

    doTrash() {
        let selection = this.getCurrentSelection(true);
        if (selection) {
            DBusUtils.NautilusFileOperationsProxy.TrashFilesRemote(selection,
                (source, error) => {
                    if (error)
                        throw new Error('Error trashing files on the desktop: ' + error.message);
                }
            );
        }
    }

    doEmptyTrash() {
        DBusUtils.NautilusFileOperationsProxy.EmptyTrashRemote( (source, error) => {
            if (error)
                throw new Error('Error trashing files on the desktop: ' + error.message);
        });
    }

    doMoveWithDragAndDrop(fileItem, xOrigin, yOrigin) {
        let deltaX = this._xDestination - xOrigin;
        let deltaY = this._yDestination - yOrigin;
        let fileItems = [fileItem];
        fileItem.removeFromGrid();
        let [x, y, a, b, c] = fileItem.getCoordinates();
        fileItem.savedCoordinates = [x + deltaX, y + deltaY];
        for(let item of this._fileList) {
            if (item.isSelected && (item != fileItem)) {
                fileItems.push(item);
                item.removeFromGrid();
                [x, y, a, b, c] = item.getCoordinates();
                item.savedCoordinates = [x + deltaX, y + deltaY];
            }
        }
        // force to store the new coordinates
        this._addFilesToDesktop(fileItems, Enums.StoredCoordinates.OVERWRITE);
    }

    checkIfSpecialFilesAreSelected() {
        for(let item of this._fileList) {
            if (item.isSelected && item.isSpecial) {
                return true;
            }
        }
        return false;
    }

    getCurrentSelection(getUri) {
        let listToTrash = [];
        for(let fileItem of this._fileList) {
            if (fileItem.isSelected) {
                if (getUri) {
                    listToTrash.push(fileItem.file.get_uri());
                } else {
                    listToTrash.push(fileItem);
                }
            }
        }
        if (listToTrash.length != 0) {
            return listToTrash;
        } else {
            return null;
        }
    }

    getNumberOfSelectedItems() {
        let count = 0;
        for(let item of this._fileList) {
            if (item.isSelected) {
                count++;
            }
        }
        return count;
    }

    doRename(fileItem) {
        for(let fileItem2 of this._fileList) {
            fileItem2.unsetSelected();
        }
        let renameWindow = new AskNamePopup.AskNamePopup(fileItem.fileName, _("Rename"), this._window);
        let newName = renameWindow.run();
        if (newName) {
            DBusUtils.NautilusFileOperationsProxy.RenameFileRemote(fileItem.file.get_uri(),
                                                                   newName,
                (result, error) => {
                    if (error)
                        throw new Error('Error renaming file: ' + error.message);
                }
            );
        }
    }

    doOpenWith() {
        let fileItems = this.getCurrentSelection(false);
        if (fileItems) {
            let mimetype = Gio.content_type_guess(fileItems[0].fileName, null)[0];
            let chooser = Gtk.AppChooserDialog.new_for_content_type(this._window,
                                                                    Gtk.DialogFlags.MODAL + Gtk.DialogFlags.USE_HEADER_BAR,
                                                                    mimetype);
            chooser.show_all();
            let retval = chooser.run();
            chooser.hide();
            if (retval == Gtk.ResponseType.OK) {
                let appInfo = chooser.get_app_info();
                if (appInfo) {
                    let fileList = [];
                    for (let item of fileItems) {
                        fileList.push(item.file);
                    }
                    appInfo.launch(fileList, null);
                }
            }

        }
    }

    _newFolder() {
        for(let fileItem of this._fileList) {
            fileItem.unsetSelected();
        }
        let newFolderWindow = new AskNamePopup.AskNamePopup(null, _("New folder"), this._window);
        let newName = newFolderWindow.run();
        if (newName) {
            let dir = DesktopIconsUtil.getDesktopDir().get_child(newName);
            DBusUtils.NautilusFileOperationsProxy.CreateFolderRemote(dir.get_uri(),
                (result, error) => {
                    if (error)
                        throw new Error('Error creating new folder: ' + error.message);
                }
            );
        }
    }
}
