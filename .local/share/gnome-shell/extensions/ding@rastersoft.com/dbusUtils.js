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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
var NautilusFileOperationsProxy;
var FreeDesktopFileManagerProxy;

const NautilusFileOperationsInterface = `<node>
<interface name='org.gnome.Nautilus.FileOperations'>
    <method name='CopyURIs'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='Destination' type='s' direction='in'/>
    </method>
    <method name='MoveURIs'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='Destination' type='s' direction='in'/>
    </method>
    <method name='EmptyTrash'>
    </method>
    <method name='TrashFiles'>
        <arg name='URIs' type='as' direction='in'/>
    </method>
    <method name='CreateFolder'>
        <arg name='URI' type='s' direction='in'/>
    </method>
    <method name='RenameFile'>
        <arg name='URI' type='s' direction='in'/>
        <arg name='NewName' type='s' direction='in'/>
    </method>
    <method name='Undo'>
    </method>
    <method name='Redo'>
    </method>
    <property name='UndoStatus' type='i' access='read'/>
</interface>
</node>`;

const NautilusFileOperationsProxyInterface = Gio.DBusProxy.makeProxyWrapper(NautilusFileOperationsInterface);

const FreeDesktopFileManagerInterface = `<node>
<interface name='org.freedesktop.FileManager1'>
    <method name='ShowItems'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='StartupId' type='s' direction='in'/>
    </method>
    <method name='ShowItemProperties'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='StartupId' type='s' direction='in'/>
    </method>
</interface>
</node>`;

const FreeDesktopFileManagerProxyInterface = Gio.DBusProxy.makeProxyWrapper(FreeDesktopFileManagerInterface);

function init() {
    NautilusFileOperationsProxy = new NautilusFileOperationsProxyInterface(
        Gio.DBus.session,
        'org.gnome.Nautilus',
        '/org/gnome/Nautilus',
        (proxy, error) => {
            if (error) {
                log('Error connecting to Nautilus');
            }
        }
    );

    FreeDesktopFileManagerProxy = new FreeDesktopFileManagerProxyInterface(
        Gio.DBus.session,
        'org.freedesktop.FileManager1',
        '/org/freedesktop/FileManager1',
        (proxy, error) => {
            if (error) {
                log('Error connecting to Nautilus');
            }
        }
    );
}

function openFileWithOtherApplication(filePath) {
    let fdList = new Gio.UnixFDList();
    let channel = GLib.IOChannel.new_file(filePath, "r");
    fdList.append(channel.unix_get_fd());
    channel.set_close_on_unref(true);
    let builder = GLib.VariantBuilder.new(GLib.VariantType.new("a{sv}"));
    let options = builder.end();
    let parameters = GLib.Variant.new_tuple([GLib.Variant.new_string("0"),
                                             GLib.Variant.new_handle(0),
                                             options]);
    Gio.bus_get(Gio.BusType.SESSION, null,
        (source, result) => {
            let dbus_connection = Gio.bus_get_finish(result);
            dbus_connection.call_with_unix_fd_list("org.freedesktop.portal.Desktop",
                                                   "/org/freedesktop/portal/desktop",
                                                   "org.freedesktop.portal.OpenURI",
                                                   "OpenFile",
                                                   parameters,
                                                   GLib.VariantType.new("o"),
                                                   Gio.DBusCallFlags.NONE,
                                                   -1,
                                                   fdList,
                                                   null,
                                                   null);
        }
    );
}
