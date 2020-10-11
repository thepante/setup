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
const AskRenamePopup = imports.askRenamePopup;
const AskConfirmPopup = imports.askConfirmPopup;
const ShowErrorPopup = imports.showErrorPopup;
const TemplateManager = imports.templateManager;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var DesktopManager = class {
    constructor(appUuid, desktopList, codePath, asDesktop) {

        DBusUtils.init();
        this._clickX = 0;
        this._clickY = 0;
        this._templateManager = new TemplateManager.TemplateManager();
        this._codePath = codePath;
        this._asDesktop = asDesktop;
        this._desktopList = desktopList;
        this._desktops = [];
        this._appUuid = appUuid;
        this._desktopFilesChanged = false;
        this._readingDesktopFiles = true;
        this._toDelete = [];
        this._deletingFilesRecursively = false;
        this._desktopDir = DesktopIconsUtil.getDesktopDir();
        this.desktopFsId = this._desktopDir.query_info('id::filesystem', Gio.FileQueryInfoFlags.NONE, null).get_attribute_string('id::filesystem');
        this._updateWritableByOthers();
        this._monitorDesktopDir = this._desktopDir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorDesktopDir.set_rate_limit(1000);
        this._monitorDesktopDir.connect('changed', (obj, file, otherFile, eventType) => this._updateDesktopIfChanged(file, otherFile, eventType));
        this._showHidden = Prefs.gtkSettings.get_boolean('show-hidden');
        this._settingsId = Prefs.desktopSettings.connect('changed', (obj, key) => {
            if (key == 'icon-size') {
                this._removeAllFilesFromGrids();
                this._createGrids();
            }
            this._updateDesktop();
        });
        this._gtkSettingsId = Prefs.gtkSettings.connect('changed', (obj, key) => {
            if (key == 'show-hidden') {
                this._showHidden = Prefs.gtkSettings.get_boolean('show-hidden');
                this._updateDesktop();
            }
        });
        this._nautilusSettingsId = Prefs.nautilusSettings.connect('changed', (obj, key) => {
            if (key == 'show-image-thumbnails') {
                this._updateDesktop();
            }
        });

        this.rubberBand = false;

        let cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_file(Gio.File.new_for_path(GLib.build_filenamev([codePath, "stylesheet.css"])));
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), cssProvider, 600);

        this._configureSelectionColor();
        this._createDesktopBackgroundMenu();
        this._createGrids();

        DBusUtils.NautilusFileOperationsProxy.connect('g-properties-changed', this._undoStatusChanged.bind(this));
        this._fileList = [];
        this._readFileList();

        // Check if Nautilus is available
        try {
            DesktopIconsUtil.trySpawn(null, ["nautilus", "--version"]);
        } catch(e) {
            this._errorWindow = new ShowErrorPopup.ShowErrorPopup(_("Nautilus File Manager not found"),
                                                                  _("The Nautilus File Manager is mandatory to work with Desktop Icons NG."),
                                                                  null,
                                                                  true);
        }
    }

    _createGrids() {
        for(let desktop of this._desktops) {
            desktop.destroy();
        }
        this._desktops = [];
        for(let desktopIndex in this._desktopList) {
            let desktop = this._desktopList[desktopIndex];
            if (this._asDesktop) {
                if (this._appUuid) {
                    var desktopName = `${this._appUuid} @!${desktop.x},${desktop.y};BDH`;
                } else {
                    var desktopName = `@!${desktop.x},${desktop.y};BDH`;
                }
            } else {
                var desktopName = `DING ${desktopIndex}`;
            }
            this._desktops.push(new DesktopGrid.DesktopGrid(this, desktopName, desktop, this._asDesktop));
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
        this.selectColor = this._styleContext.get_background_color(Gtk.StateFlags.SELECTED);
        let style = `.desktop-icons-selected {
            background-color: rgba(${this.selectColor.red * 255},${this.selectColor.green * 255}, ${this.selectColor.blue * 255}, 0.6);
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

    doMoveWithDragAndDrop(fileItem, xOrigin, yOrigin, xDestination, yDestination) {
        // Find the grid where the destination lies
        for(let desktop of this._desktops) {
            let grid = desktop.getGridAt(xDestination, yDestination);
            if (grid !== null) {
                xDestination = grid[0];
                yDestination = grid[1];
                break;
            }
        }
        let deltaX = xDestination - xOrigin;
        let deltaY = yDestination - yOrigin;
        let fileItems = [];
        for(let item of this._fileList) {
            if (item.isSelected) {
                fileItems.push(item);
                item.removeFromGrid();
                let [x, y, a, b, c] = item.getCoordinates();
                item.savedCoordinates = [x + deltaX, y + deltaY];
            }
        }
        // force to store the new coordinates
        this._addFilesToDesktop(fileItems, Enums.StoredCoordinates.OVERWRITE);
    }

    onDragDataReceived(xDestination, yDestination, selection, info) {
        let [fileList, xOrigin, yOrigin] = DesktopIconsUtil.getFilesFromNautilusDnD(selection, info);
        switch(info) {
        case 0:
            if (fileList.length != 0) {
                this.doMoveWithDragAndDrop(this, parseInt(xOrigin), parseInt(yOrigin), xDestination, yDestination);
            }
            break;
        case 1:
        case 2:
            if (fileList.length != 0) {
                this.clearFileCoordinates(fileList, `${xDestination},${yDestination}`);
                let data = Gio.File.new_for_uri(fileList[0]).query_info('id::filesystem', Gio.FileQueryInfoFlags.NONE, null);
                let id_fs = data.get_attribute_string('id::filesystem');
                if (this.desktopFsId == id_fs) {
                    DBusUtils.NautilusFileOperationsProxy.MoveURIsRemote(
                        fileList,
                        "file://" + GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
                        (result, error) => {
                            if (error)
                                throw new Error('Error moving files: ' + error.message);
                            }
                    );
                } else {
                    DBusUtils.NautilusFileOperationsProxy.CopyURIsRemote(
                        fileList,
                        "file://" + GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
                        (result, error) => {
                            if (error)
                                throw new Error('Error moving files: ' + error.message);
                            }
                    );
                }
            }
            break;
        }
    }

    fillDragDataGet(info, x, y) {
        let fileList = this.getCurrentSelection(false);
        if (fileList == null) {
            return null;
        }
        let atom;
        switch(info) {
            case 0:
                atom = Gdk.atom_intern('x-special/ding-icon-list', false);
                break;
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
            if (info == 0) {
                data += `\r${x} ${y}`
            }
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

    onPressButton(x, y, event, grid) {

        this._clickX = Math.floor(x);
        this._clickY = Math.floor(y);
        let button = event.get_button()[1];
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
            let templates = this._templateManager.getTemplates();
            if (templates.length == 0) {
                this._newDocumentItem.hide();
            } else {
                let templateMenu = new Gtk.Menu();
                this._newDocumentItem.set_submenu(templateMenu);
                for(let template of templates) {
                    let box = new Gtk.Box({"orientation":Gtk.Orientation.HORIZONTAL, "spacing": 6});
                    let icon = Gtk.Image.new_from_gicon(template["icon"], Gtk.IconSize.MENU);
                    let text = new Gtk.Label({"label": template["name"]});
                    box.add(icon);
                    box.add(text);
                    let entry = new Gtk.MenuItem({"label": template["name"]});
                    //entry.add(box);
                    templateMenu.add(entry);
                    entry.connect("activate", ()=>{
                        this._newDocument(template);
                    });
                }
                this._newDocumentItem.show_all();
            }
            this._syncUndoRedo();
            let atom = Gdk.Atom.intern('CLIPBOARD', false);
            let clipboard = Gtk.Clipboard.get(atom);
            clipboard.request_text((clipboard, text) => {
                let [valid, is_cut, files] = this._parseClipboardText(text);
                this._pasteMenuItem.set_sensitive(valid);
            });
            this._menu.popup_at_pointer(event);
        }
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

    onKeyPress(event, grid) {
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
            if (isShift) {
                this.doDeletePermanently();
            } else {
                this.doTrash();
            }
            return true;
        } else if (symbol == Gdk.KEY_F2) {
            let selection = this.getCurrentSelection(false);
            if (selection && (selection.length == 1)) {
                // Support renaming other grids file items.
                this.doRename(selection[0]);
                return true;
            }
        } else if (symbol == Gdk.KEY_space) {
            let selection = this.getCurrentSelection(false);
            if (selection) {
                // Support renaming other grids file items.
                DBusUtils.GnomeNautilusPreviewProxy.ShowFileRemote(selection[0].uri, 0, false);
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

        this._newDocumentItem = new Gtk.MenuItem({label: _("New Document")});
        this._menu.add(this._newDocumentItem);

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

        let selectAll = new Gtk.MenuItem({label: _("Select all")});
        selectAll.connect("activate", () => this._selectAll());
        this._menu.add(selectAll);

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

    _selectAll() {
        for(let fileItem of this._fileList) {
            if (fileItem.isAllSelectable) {
                fileItem.setSelected();
            }
        }
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
        DesktopIconsUtil.launchTerminal(desktopPath, null);
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

    onMotion(x, y) {
        if (this.rubberBand) {
            this.mouseX = x;
            this.mouseY = y;
            for(let grid of this._desktops) {
                grid.queue_draw();
            }
            let x1 = Math.min(x, this.rubberBandInitX);
            let x2 = Math.max(x, this.rubberBandInitX);
            let y1 = Math.min(y, this.rubberBandInitY);
            let y2 = Math.max(y, this.rubberBandInitY);
            for(let item of this._fileList) {
                item.updateRubberband(x1, y1, x2, y2);
            }
        }
        return false;
    }

    onReleaseButton(grid) {
        if (this.rubberBand) {
            this.rubberBand = false;
            for(let item of this._fileList) {
                item.endRubberband();
            }
        }
        for(let grid of this._desktops) {
            grid.queue_draw();
        }
        return false;
    }

    _startRubberband(x, y) {
        this.rubberBandInitX = x;
        this.rubberBandInitY = y;
        this.mouseX = x;
        this.mouseY = y;
        this.rubberBand = true;
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
            if (this.rubberBand) {
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
                        let fileList = [];
                        // if no file changed while reading the desktop folder, the fileItems list if right
                        this._readingDesktopFiles = false;
                        for (let [newFolder, extras] of DesktopIconsUtil.getExtraFolders()) {
                            fileList.push(
                                new FileItem.FileItem(
                                    this,
                                    newFolder,
                                    newFolder.query_info(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null),
                                    extras,
                                    this._codePath
                                )
                            );
                        }
                        let info;
                        while ((info = fileEnum.next_file(null))) {
                            let fileItem = new FileItem.FileItem(
                                this,
                                fileEnum.get_child(info),
                                info,
                                Enums.FileType.NONE,
                                this._codePath
                            );
                            if (fileItem.isHidden && !this._showHidden) {
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
                            fileList.push(fileItem);
                        }
                        this._removeAllFilesFromGrids();
                        this._fileList = fileList;
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
            // try first in the designated desktop
            let assigned = false;
            for (let desktop of this._desktops) {
                if (desktop.getDistance(x, y) == 0) {
                    desktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                    assigned = true;
                    break;
                }
            }
            if (assigned) {
                continue;
            }
            // if there is no space in the designated desktop, try in another
            for (let desktop of this._desktops) {
                if (desktop.getDistance(x, y) != -1) {
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
        if (eventType == Gio.FileMonitorEvent.CHANGED) {
            // use only CHANGES_DONE_HINT
            return;
        }
        if (!this._showHidden && (file.get_basename()[0] == '.')) {
            // If the file is not visible, we don't need to refresh the desktop
            // Unless it is a hidden file being renamed to visible
            if (!otherFile || (otherFile.get_basename()[0] == '.')) {
                return;
            }
        }
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

    _deleteRecursively() {
        if (this._deletingFilesRecursively || (this._toDelete.length == 0)) {
            return;
        }
        this._deletingFilesRecursively = true;
        let nextFileToDelete = this._toDelete.shift();
        if (nextFileToDelete.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) == Gio.FileType.DIRECTORY) {
            nextFileToDelete.enumerate_children_async(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null, (source, res) => {
                let fileEnum = source.enumerate_children_finish(res);
                // insert again the folder at the beginning
                this._toDelete.unshift(source);
                let info;
                let hasChilds = false;
                while ((info = fileEnum.next_file(null))) {
                    let file = fileEnum.get_child(info);
                    // insert the children to the beginning of the array, to be deleted first
                    this._toDelete.unshift(file);
                    hasChilds = true;
                }
                if (!hasChilds) {
                    // the folder is empty, so it can be deleted
                    this._toDelete.shift().delete_async(GLib.PRIORITY_DEFAULT, null, (source, res) => {
                        try {
                            source.delete_finish(res);
                        } catch(e) {
                            let windowError = new ShowErrorPopup.ShowErrorPopup(_("Error while deleting files"),
                                                                                _("There was an error while trying to permanently delete the folder {:}.").replace('{:}', source.get_parse_name()),
                                                                                null,
                                                                                false);
                            windowError.run();
                            return;
                        }
                        // continue with the next file
                        this._deletingFilesRecursively = false;
                        this._deleteRecursively();
                    }); // remove it from the list (yes, again)
                }
                // continue processing the list
                this._deletingFilesRecursively = false;
                this._deleteRecursively();
            });
        } else {
            nextFileToDelete.delete_async(GLib.PRIORITY_DEFAULT, null, (source, res) => {
                try {
                    source.delete_finish(res);
                } catch(e) {
                    let windowError = new ShowErrorPopup.ShowErrorPopup(_("Error while deleting files"),
                                                                        _("There was an error while trying to permanently delete the file {:}.").replace('{:}', source.get_parse_name()),
                                                                        null,
                                                                        false);
                    windowError.run();
                    return;
                }
                // continue with the next file
                this._deletingFilesRecursively = false;
                this._deleteRecursively();
            });
        }
    }

    doDeletePermanently() {
        let filelist = "";
        for(let fileItem of this._fileList) {
            if (fileItem.isSelected) {
                if (filelist != "") {
                    filelist += ", "
                }
                filelist += `"${fileItem.fileName}"`;
            }
        }
        let renameWindow = new AskConfirmPopup.AskConfirmPopup(_("Are you sure you want to permanently delete these items?"), `${_("If you delete an item, it will be permanently lost.")}\n\n${filelist}`, null);
        if (renameWindow.run()) {
            this._permanentDeleteError = false;
            for(let fileItem of this._fileList) {
                if (fileItem.isSelected) {
                    this._toDelete.push(fileItem.file);
                }
            }
            this._deleteRecursively();
        }
    }

    doEmptyTrash() {
        DBusUtils.NautilusFileOperationsProxy.EmptyTrashRemote( (source, error) => {
            if (error)
                throw new Error('Error trashing files on the desktop: ' + error.message);
        });
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
        this._renameWindow = new AskRenamePopup.AskRenamePopup(fileItem);
    }

    doOpenWith() {
        let fileItems = this.getCurrentSelection(false);
        if (fileItems) {
            let mimetype = Gio.content_type_guess(fileItems[0].fileName, null)[0];
            let chooser = Gtk.AppChooserDialog.new_for_content_type(null,
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

    _newFolder(window) {
        for(let fileItem of this._fileList) {
            fileItem.unsetSelected();
        }
        let newFolderWindow = new AskNamePopup.AskNamePopup(null, _("New folder"), null);
        let newName = newFolderWindow.run();
        if (newName) {
            let dir = DesktopIconsUtil.getDesktopDir().get_child(newName);
            try {
                dir.make_directory(null);
                let info = new Gio.FileInfo();
                info.set_attribute_string('metadata::nautilus-drop-position', `${this._clickX},${this._clickY}`);
                info.set_attribute_string('metadata::nautilus-icon-position', '');
                dir.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
            } catch(e) {
                print(`Failed to create folder ${e.message}`);
            }
        }
    }

    _newDocument(template) {
        let file = this._templateManager.getTemplateFile(template["file"]);
        if (file == null) {
            return;
        }
        let counter = 0;
        let finalName = `${template["name"]}${template["extension"]}`;
        let destination;
        do {
            if (counter != 0) {
                finalName = `${template["name"]} ${counter}${template["extension"]}`
            }
            destination = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP), finalName]));
            counter++;
        } while(destination.query_exists(null));
        try {
            file.copy(destination, Gio.FileCopyFlags.NONE, null, null);
            let info = new Gio.FileInfo();
            info.set_attribute_string('metadata::nautilus-drop-position', `${this._clickX},${this._clickY}`);
            info.set_attribute_string('metadata::nautilus-icon-position', '');
            destination.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
        } catch(e) {
            print(`Failed to create template ${e.message}`);
        }
    }
}
