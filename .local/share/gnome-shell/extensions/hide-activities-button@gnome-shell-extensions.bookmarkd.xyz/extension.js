const Main = imports.ui.main;

let activitiesButton;

function enable() {
    activitiesButton = Main.panel.statusArea['activities'];
    activitiesButton.container.hide();
}

function disable() {
    activitiesButton.container.show();
}

function init(metadata) {

}
