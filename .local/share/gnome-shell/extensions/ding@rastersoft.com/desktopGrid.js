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

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const Prefs = imports.preferences;
const Enums = imports.enums;
const DesktopIconsUtil = imports.desktopIconsUtil;
const Signals = imports.signals;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;


var elementSpacing = 2;

var DesktopGrid = class {

    constructor(desktopManager, UUID, desktopDescription, asDesktop) {

        this._destroying = false;
        this._desktopManager = desktopManager;
        this._asDesktop = asDesktop;
        this._zoom = desktopDescription.zoom;
        this._x = desktopDescription.x;
        this._y = desktopDescription.y;
        this._width = Math.floor(desktopDescription.width / this._zoom);
        this._height = Math.floor(desktopDescription.height / this._zoom);
        this._UUID = UUID;
        this._maxColumns = Math.floor(this._width / (Prefs.get_desired_width() + 4 * elementSpacing));
        this._maxRows =  Math.floor(this._height / (Prefs.get_desired_height() + 4 * elementSpacing));
        this._elementWidth = Math.floor(this._width / this._maxColumns);
        this._elementHeight = Math.floor(this._height / this._maxRows);

        this._window = new Gtk.Window();
        this._window.set_title(this._UUID);
        if (asDesktop) {
            this._window.set_decorated(false);
            this._window.set_deletable(false);
            // If we are under X11, manage everything from here
            if (Gdk.Display.get_default().constructor.$gtype.name === 'GdkX11Display') {
                this._window.set_type_hint(Gdk.WindowTypeHint.DESKTOP);
                this._window.stick();
                this._window.move(this._x / this._zoom, this._y / this._zoom);
            }
        }
        this._window.set_resizable(false);
        this._window.connect('delete-event', () => {
            if (this._destroying) {
                return false;
            }
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

        // Transparent background, but only if this instance is working as desktop
        this._window.set_app_paintable(true);
        if (asDesktop) {
            let screen = this._window.get_screen();
            let visual = screen.get_rgba_visual();
            if (visual && screen.is_composited() && this._asDesktop) {
                this._window.set_visual(visual);
                this._window.connect('draw', (widget, cr) => {
                    Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: 0.0, green: 0.0, blue: 0.0, alpha: 0.0}));
                    cr.paint();
                    cr.$dispose();
                    return false;
                });
            }
        }
        this._container.connect('draw', (widget, cr) => {
            this._doDrawRubberBand(cr);
            cr.$dispose();
        });

        this._fileItems = {};

        this._gridStatus = {};
        for (let y=0; y<this._maxRows; y++) {
            for (let x=0; x<this._maxColumns; x++) {
                this._setGridUse(x, y, false);
            }
        }
        this._window.show_all();
        this._window.set_size_request(this._width, this._height);
        this._window.resize(this._width, this._height);
        this._eventBox.add_events(Gdk.EventMask.BUTTON_MOTION_MASK |
                                  Gdk.EventMask.BUTTON_PRESS_MASK |
                                  Gdk.EventMask.BUTTON_RELEASE_MASK |
                                  Gdk.EventMask.KEY_RELEASE_MASK);
        this._eventBox.connect('button-press-event', (actor, event) => {
            let [a, x, y] = event.get_coords();
            [x, y] = this._coordinatesLocalToGlobal(x, y);
            this._desktopManager.onPressButton(x, y, event, this._window);
            return false;
        });
        this._eventBox.connect('motion-notify-event', (actor, event) => {
            let [a, x, y] = event.get_coords();
            [x, y] = this._coordinatesLocalToGlobal(x, y);
            this._desktopManager.onMotion(x, y);
        });
        this._eventBox.connect('button-release-event', (actor, event) => {
            this._desktopManager.onReleaseButton();
        });
        this._window.connect('key-press-event', (actor, event) => {
            this._desktopManager.onKeyPress(event);
        });
        this._eventBox.connect('drag-motion', (widget, context, x, y) => {
            [x, y] = this._coordinatesLocalToGlobal(x, y);
            this._desktopManager.xDestination = x;
            this._desktopManager.yDestination = y;
        });
    }

    destroy() {
        this._destroying = true;
        this._window.destroy();
    }

    setDropDestination(dropDestination) {
        dropDestination.drag_dest_set(Gtk.DestDefaults.ALL, null, Gdk.DragAction.MOVE);
        let targets = new Gtk.TargetList(null);
        targets.add(Gdk.atom_intern('x-special/ding-icon-list', false), Gtk.TargetFlags.SAME_APP, 0);
        targets.add(Gdk.atom_intern('x-special/gnome-icon-list', false), 0, 1);
        targets.add(Gdk.atom_intern('text/uri-list', false), 0, 2);
        dropDestination.drag_dest_set_target_list(targets);
        dropDestination.connect('drag-data-received', (widget, context, x, y, selection, info, time) => {
            [x, y] = this._coordinatesLocalToGlobal(x, y);
            this._desktopManager.onDragDataReceived(x, y, selection, info);
        });
    }

    queue_draw() {
        this._window.queue_draw();
    }

    _doDrawRubberBand(cr) {
        if (this._desktopManager.rubberBand) {
            let [xInit, yInit] = this._coordinatesGlobalToLocal(this._desktopManager.rubberBandInitX,
                                                                this._desktopManager.rubberBandInitY);
            let [xFin, yFin] = this._coordinatesGlobalToLocal(this._desktopManager.mouseX,
                                                              this._desktopManager.mouseY);
            cr.rectangle(xInit, yInit, xFin - xInit, yFin - yInit);
            Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({
                                                        red: this._desktopManager.selectColor.red,
                                                        green: this._desktopManager.selectColor.green,
                                                        blue: this._desktopManager.selectColor.blue,
                                                        alpha: 0.6})
            );
            cr.fill();
        }
    }

    getDistance(x, y) {
        /**
         * Checks if these coordinates belong to this grid.
         *
         * @Returns: -1 if there is no free space for new icons;
         *            0 if the coordinates are inside this grid;
         *            or the distance to the middle point, if none of the previous
         */

         let isFree = false;
         for (let element in this._gridStatus) {
             if (!this._gridStatus[element]) {
                 isFree = true;
                 break;
             }
         }
         if (!isFree) {
             return -1;
         }
         if ((x >= this._x) && (x < (this._x + this._width * this._zoom)) && (y >= this._y) && (y < (this._y + this._height * this._zoom))) {
             return 0;
         }
         return Math.pow(x - (this._x + this._width * this._zoom / 2), 2) + Math.pow(x - (this._y + this._height * this._zoom / 2), 2);
    }

    _coordinatesGlobalToLocal(x, y) {
        x = DesktopIconsUtil.clamp(Math.floor((x - this._x) / this._zoom), 0, this._width - 1);
        y = DesktopIconsUtil.clamp(Math.floor((y - this._y) / this._zoom), 0, this._height - 1);
        return [x, y];
    }

    _coordinatesLocalToGlobal(x, y) {
        return [x * this._zoom + this._x, y * this._zoom + this._y];
    }

    _addFileItemTo(fileItem, column, row, coordinatesAction) {

        let localX = Math.floor(this._width * column / this._maxColumns);
        let localY = Math.floor(this._height * row / this._maxRows);
        this._container.put(fileItem.actor, localX + elementSpacing, localY + elementSpacing);
        this._setGridUse(column, row, true);
        this._fileItems[fileItem.uri] = [column, row, fileItem];
        let [x, y] = this._coordinatesLocalToGlobal(localX + elementSpacing, localY + elementSpacing);
        fileItem.setCoordinates(x,
                                y,
                                this._elementWidth - 2 * elementSpacing,
                                this._elementHeight - 2 * elementSpacing,
                                elementSpacing,
                                this._zoom,
                                this);
        /* If this file is new in the Desktop and hasn't yet
         * fixed coordinates, store the new possition to ensure
         * that the next time it will be shown in the same possition.
         * Also store the new possition if it has been moved by the user,
         * and not triggered by a screen change.
         */
        if ((fileItem.savedCoordinates == null) || (coordinatesAction == Enums.StoredCoordinates.OVERWRITE)) {
            fileItem.savedCoordinates = [x, y];
        }
    }

    removeItem(fileItem) {
        if (fileItem.uri in this._fileItems) {
            let [column, row, tmp] = this._fileItems[fileItem.uri];
            this._setGridUse(column, row, false);
            this._container.remove(fileItem.actor);
            delete this._fileItems[fileItem.uri];
        }
    }

    addFileItemCloseTo(fileItem, x, y, coordinatesAction) {
        let [column, row] = this._getEmptyPlaceClosestTo(x, y, coordinatesAction);
        this._addFileItemTo(fileItem, column, row, coordinatesAction);
    }

    _isEmptyAt(x,y) {
        return !this._gridStatus[y * this._maxColumns + x];
    }

    _setGridUse(x, y, inUse) {
        this._gridStatus[y * this._maxColumns + x] = inUse;
    }

    getGridAt(x, y) {
        if ((x >= this._x) && (x < (this._x + this._width * this._zoom)) && (y >= this._y) && (y < (this._y + this._height * this._zoom))) {
            let [xLocal, yLocal] = this._coordinatesGlobalToLocal(x, y);
            let column = Math.floor(xLocal * this._maxColumns / this._width);
            let row = Math.floor(yLocal * this._maxRows / this._height);
            let gridX = Math.round((column * this._width) / this._maxColumns);
            let gridY = Math.round((row * this._height) / this._maxRows);
            let [oX, oY] = this._coordinatesLocalToGlobal(gridX, gridY);
            oX = Math.max(this._x, oX);
            oY = Math.max(this._y, oY);
            return [oX, oY];
        } else {
            return null;
        }
    }

    _getEmptyPlaceClosestTo(x, y, coordinatesAction) {

        [x, y] = this._coordinatesGlobalToLocal(x, y);
        let placeX = Math.round(x * this._maxColumns / this._width);
        let placeY = Math.round(y * this._maxRows / this._height);

        placeX = DesktopIconsUtil.clamp(placeX, 0, this._maxColumns - 1);
        placeY = DesktopIconsUtil.clamp(placeY, 0, this._maxRows - 1);
        if (this._isEmptyAt(placeX, placeY)) {
            return [placeX, placeY];
        }
        let found = false;
        let resColumn = null;
        let resRow = null;
        let minDistance = Infinity;
        for (let column = 0; column < this._maxColumns; column++) {
            for (let row = 0; row < this._maxRows; row++) {
                if (!this._isEmptyAt(column, row)) {
                    continue;
                }

                let proposedX = Math.round((column * this._width) / this._maxColumns);
                let proposedY = Math.round((row * this._height) / this._maxRows);
                if (coordinatesAction == Enums.StoredCoordinates.ASSIGN)
                    return [column, row];
                let distance = DesktopIconsUtil.distanceBetweenPoints(proposedX, proposedY, x, y);
                if (distance < minDistance) {
                    found = true;
                    minDistance = distance;
                    resColumn = column;
                    resRow = row;
                }
            }
        }

        if (!found) {
            throw new Error(`Not enough place at monitor`);
        }

        return [resColumn, resRow];
    }
};
