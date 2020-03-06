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

var ICON_SIZE = { 'small': 48, 'standard': 64, 'large': 96 };
var ICON_WIDTH = { 'small': 112, 'standard': 120, 'large': 120 };
var ICON_HEIGHT = { 'small': 90, 'standard': 106, 'large': 138 };

var FileType = {
    NONE: null,
    USER_DIRECTORY_HOME: 'show-home',
    USER_DIRECTORY_TRASH: 'show-trash',
}

var StoredCoordinates = {
    PRESERVE: 0,
    OVERWRITE:1,
    ASSIGN:2,
};

var Selection = {
    ALONE: 0,
    WITH_SHIFT: 1,
    RIGHT_BUTTON: 2,
    ENTER: 3,
    LEAVE: 4,
    RELEASE: 5
};

/* From NautilusFileUndoManagerState */
var UndoStatus = {
    NONE: 0,
    UNDO: 1,
    REDO: 2,
};

var FileExistOperation = {
    ASK: 0,
    OVERWRITE: 1,
    RENAME: 2,
    SKIP: 3
};

var DEFAULT_ATTRIBUTES = 'metadata::*,standard::*,access::*,time::modified,unix::mode';
var TERMINAL_SCHEMA = 'org.gnome.desktop.default-applications.terminal';
var SCHEMA_NAUTILUS = 'org.gnome.nautilus.preferences';
var SCHEMA_GTK = 'org.gtk.Settings.FileChooser';
var SCHEMA = 'org.gnome.shell.extensions.ding';
var EXEC_KEY = 'exec';

var S_IXUSR = 0o00100;
var S_IWOTH = 0o00002;
