/* DING: Desktop Icons New Generation for GNOME Shell
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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Enums = imports.enums;
const DesktopIconsUtil = imports.desktopIconsUtil;

var TemplateManager = class {

    constructor() {
        this._templateDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_TEMPLATES);
        this._templateGFile = Gio.File.new_for_path(this._templateDir);
        this._templates = [];
        this._templatesEnumerateCancellable = null;
        this._monitor = this._templateGFile.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect("changed", () => {
            this._refreshTemplates();
        });
        this._refreshTemplates();
    }

    getTemplates() {
        let templates = [];
        for(let template of this._templates) {
            let data = {};
            data["icon"] = template.get_icon();
            let name = template.get_name();
            let offset = DesktopIconsUtil.getFileExtensionOffset(name, false);
            data["name"] = name.substring(0, offset);
            data["extension"] = name.substring(offset);
            data["file"] = name;
            templates.push(data);
        }
        return templates;
    }

    _refreshTemplates() {
        if (this._templatesEnumerateCancellable) {
            this._templatesEnumerateCancellable.cancel();
        }
        this._templatesEnumerateCancellable = new Gio.Cancellable();
        this._templateGFile.enumerate_children_async(
            Enums.DEFAULT_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            this._templatesEnumerateCancellable,
            (source, result) => {
                try {
                    let fileEnum = source.enumerate_children_finish(result);
                    this._templates = [];
                    let info;
                    while ((info = fileEnum.next_file(null))) {
                        this._templates.push(info);
                    }
                } catch(e) {}
            }
        );
    }

    getTemplateFile(name) {
        let template = Gio.File.new_for_path(GLib.build_filenamev([this._templateDir, name]));
        if (template.query_exists(null)) {
            return template;
        } else {
            return null;
        }
    }
}
