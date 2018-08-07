
const St = imports.gi.St;
const Main = imports.ui.main;

let button;

function _showApps() {
    if (Main.overview.visible) {
        Main.overview.toggle();
    } else { 
        Main.overview.viewSelector.showApps();
    }
}

function init() {
    button = new St.Bin({ style_class: 'panel-button',
                          reactive: true,
                          can_focus: true,
                          x_fill: true,
                          y_fill: false,
                          track_hover: true });
    let icon = new St.Icon({ icon_name: 'view-grid-symbolic',
                             style_class: 'system-status-icon' });

    button.set_child(icon);
    button.connect('button-press-event', _showApps);
}

function enable() {
    Main.panel._leftBox.insert_child_at_index(button, 1);
}

function disable() {
    Main.panel._leftBox.remove_child(button);
}
