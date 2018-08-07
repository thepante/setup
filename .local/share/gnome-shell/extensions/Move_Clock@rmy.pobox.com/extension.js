// Copyright (C) 2011-2017 R M Yorston
// Licence: GPLv2+

const Main = imports.ui.main;
const SessionMode = imports.ui.sessionMode;

function init() {
}

function enable() {
    // do nothing if the clock isn't centred in this mode
    if ( Main.sessionMode.panel.center.indexOf('dateMenu') == -1 ) {
        return;
    }

    let centerBox = Main.panel._centerBox;
    let rightBox = Main.panel._rightBox;
    let dateMenu = Main.panel.statusArea['dateMenu'];
    let children = centerBox.get_children();

    // only move the clock if it's in the centre box
    if ( children.indexOf(dateMenu.container) != -1 ) {
        centerBox.remove_actor(dateMenu.container);

        children = rightBox.get_children();
        rightBox.insert_child_at_index(dateMenu.container, children.length-1);
   }
}

function disable() {
    // do nothing if the clock isn't centred in this mode
    if ( Main.sessionMode.panel.center.indexOf('dateMenu') == -1 ) {
        return;
    }

    let centerBox = Main.panel._centerBox;
    let rightBox = Main.panel._rightBox;
    let dateMenu = Main.panel.statusArea['dateMenu'];
    let children = rightBox.get_children();

    // only move the clock back if it's in the right box
    if ( children.indexOf(dateMenu.container) != -1 ) {
        rightBox.remove_actor(dateMenu.container);
        centerBox.add_actor(dateMenu.container);
    }
}
