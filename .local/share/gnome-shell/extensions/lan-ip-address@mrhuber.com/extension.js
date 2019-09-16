const GLib = imports.gi.GLib;
const ShellToolkit = imports.gi.St;

const Main = imports.ui.main;

let main_container_properties = { style_class: 'panel-button', reactive: true };
let main_container = new ShellToolkit.Bin(main_container_properties);

let main_container_content = new ShellToolkit.Label({ text: _get_lan_ip() });
let main_container_content_updater = function() { main_container_content.set_text(_get_lan_ip()); };

function _get_lan_ip()
{
        // Ask the IP stack what route would be used to reach 1.1.1.1 (Cloudflare DNS)
        // Specifically, what src would be used for the 1st hop?
        var command_output_bytes = GLib.spawn_command_line_sync('ip route get 1.1.1.1')[1];
        var command_output_string = '';

        for (var current_character_index = 0;
             current_character_index < command_output_bytes.length;
             ++current_character_index)
        {
                var current_character = String.fromCharCode(command_output_bytes[current_character_index]);
                command_output_string += current_character;
        }

        // Output of the "ip route" command will be a string
        // " ... src 1.2.3.4 ..."
        // So basically we want the next token (word) immediately after the "src"
        // word, and nothing else. This is considerd our LAN IP address.
        var Re = new RegExp(/src [^ ]+/g);
        var lanIpAddress = command_output_string.match(Re)[0].split(' ')[1];

        // ditch new line escape sequence from the string
        return lanIpAddress;
}

function init()
{
        main_container.set_child(main_container_content);
        main_container.connect('button-press-event', main_container_content_updater);
}

function enable()
{
        Main.panel._rightBox.insert_child_at_index(main_container, 0);
}

function disable()
{
        Main.panel._rightBox.remove_child(main_container);
}
