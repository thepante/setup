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
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Prefs = imports.preferences;
const Enums = imports.enums;
const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

function getDesktopDir() {
    let desktopPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
    return Gio.File.new_for_commandline_arg(desktopPath);
}

function clamp(value, min, max) {
    return Math.max(Math.min(value, max), min);
};

function spawnCommandLine(command_line) {
    try {
        let [success, argv] = GLib.shell_parse_argv(command_line);
        trySpawn(null, argv);
    } catch (err) {
        print(`${command_line} failed with ${err}`);
    }
}

function launchTerminal(workdir, command) {
    let terminalSettings = new Gio.Settings({ schema_id: Enums.TERMINAL_SCHEMA });
    let exec = terminalSettings.get_string(Enums.EXEC_KEY);
    let argv = [exec, `--working-directory=${workdir}`];
    if (command) {
        argv.push('-e');
        argv.push(command);
    }
    trySpawn(workdir, argv);
}

function trySpawn(workdir, argv) {
    /* The following code has been extracted from GNOME Shell's
     * source code in Misc.Util.trySpawn function and modified to
     * set the working directory.
     *
     * https://gitlab.gnome.org/GNOME/gnome-shell/blob/gnome-3-30/js/misc/util.js
     */

    var success, pid;
    try {
        [success, pid] = GLib.spawn_async(workdir, argv, null,
                                          GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                                          null);
    } catch (err) {
        /* Rewrite the error in case of ENOENT */
        if (err.matches(GLib.SpawnError, GLib.SpawnError.NOENT)) {
            throw new GLib.SpawnError({ code: GLib.SpawnError.NOENT,
                                        message: _("Command not found") });
        } else if (err instanceof GLib.Error) {
            // The exception from gjs contains an error string like:
            //   Error invoking GLib.spawn_command_line_async: Failed to
            //   execute child process "foo" (No such file or directory)
            // We are only interested in the part in the parentheses. (And
            // we can't pattern match the text, since it gets localized.)
            let message = err.message.replace(/.*\((.+)\)/, '$1');
            throw new (err.constructor)({ code: err.code,
                                          message: message });
        } else {
            throw err;
        }
    }
    // Dummy child watch; we don't want to double-fork internally
    // because then we lose the parent-child relationship, which
    // can break polkit.  See https://bugzilla.redhat.com//show_bug.cgi?id=819275
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {});
}

function distanceBetweenPoints(x, y, x2, y2) {
    return (Math.pow(x - x2, 2) + Math.pow(y - y2, 2));
}

function getExtraFolders() {
    let extraFolders = new Array();
    if (Prefs.desktopSettings.get_boolean('show-home')) {
        extraFolders.push([Gio.File.new_for_commandline_arg(GLib.get_home_dir()), Enums.FileType.USER_DIRECTORY_HOME]);
    }
    if (Prefs.desktopSettings.get_boolean('show-trash')) {
        extraFolders.push([Gio.File.new_for_uri('trash:///'), Enums.FileType.USER_DIRECTORY_TRASH]);
    }
    return extraFolders;
}

function getFileExtensionOffset(filename, isDirectory) {
    let offset = filename.length;

    if (!isDirectory) {
        let doubleExtensions = ['.gz', '.bz2', '.sit', '.Z', '.bz', '.xz'];
        for (let extension of doubleExtensions) {
            if (filename.endsWith(extension)) {
                offset -= extension.length;
                filename = filename.substring(0, offset);
                break;
            }
        }
        let lastDot = filename.lastIndexOf('.');
        if (lastDot > 0)
            offset = lastDot;
    }
    return offset;
}

function getFilesFromNautilusDnD(selection, type) {
    let data = String.fromCharCode.apply(null, selection.get_data());
    let retval = [];
    let elements = data.split('\r\n');
    let x;
    let y;
    for(let item of elements) {
        if (item.length == 0) {
            continue;
        }
        if ((type == 0) || (type == 1)) {
            // x-special/gnome-icon-list and x-special/ding-icon-list
            let entry = item.split('\r');
            retval.push(entry[0]);
            if (type == 0) {
                [x, y] = entry[1].split(' ');
            }
        } else {
            // text/uri-list
            if (item[0] == '#') {
                continue;
            }
            retval.push(item);
        }
    }
    return [retval, x, y];
}


function isExecutable(mimetype, file_name) {

    if (Gio.content_type_can_be_executable(mimetype)) {
        switch (Prefs.nautilusSettings.get_string('executable-text-activation')) {
            default: // display
                return Enums.WhatToDoWithExecutable.DISPLAY;
            case 'launch':
                return Enums.WhatToDoWithExecutable.EXECUTE;
            case 'ask':
                let dialog = new Gtk.MessageDialog({
                    text: _("Do you want to run “{0}”, or display its contents?").replace('{0}', file_name),
                    secondary_text: _("“{0}” is an executable text file.").replace('{0}', file_name),
                    message_type: Gtk.MessageType.QUESTION,
                    buttons: Gtk.ButtonsType.NONE
                });
                dialog.add_button(_("Execute in a terminal"),
                                  Enums.WhatToDoWithExecutable.EXECUTE_IN_TERMINAL);
                dialog.add_button(_("Show"),
                                  Enums.WhatToDoWithExecutable.DISPLAY);
                dialog.add_button(_("Cancel"),
                                  Gtk.ResponseType.CANCEL);
                dialog.add_button(_("Execute"),
                                  Enums.WhatToDoWithExecutable.EXECUTE);
                dialog.set_default_response(Gtk.ResponseType.CANCEL);

                dialog.show_all();
                let result = dialog.run();
                dialog.destroy();
                if ((result != Enums.WhatToDoWithExecutable.EXECUTE) &&
                    (result != Enums.WhatToDoWithExecutable.EXECUTE_IN_TERMINAL) &&
                    (result != Enums.WhatToDoWithExecutable.DISPLAY)) {
                        return Gtk.ResponseType.CANCEL;
                } else {
                        return result;
                }
        }
    } else {
        return Enums.WhatToDoWithExecutable.DISPLAY;
    }
}
