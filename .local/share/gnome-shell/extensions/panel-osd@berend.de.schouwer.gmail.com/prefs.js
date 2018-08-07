/* jshint esnext:true */
/*
 *
 *  GNOME Shell Extension Panel OSD preferences
 *  - Creates a widget to set the preferences of the panel-osd extension
 *
 * Copyright (C) 2014 - 2015
 *     Jens Lody <jens@jenslody.de>,
 *
 * This file is part of gnome-shell-extension-panel-osd.
 *
 * gnome-shell-extension-panel-osd is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * gnome-shell-extension-panel-osd is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-panel-osd.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const GtkBuilder = Gtk.Builder;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Gettext = imports.gettext.domain('gnome-shell-extension-panel-osd');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const EXTENSIONDIR = Me.dir.get_path();

const PANEL_OSD_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.panel-osd';
const PANEL_OSD_X_POS_KEY = 'x-pos';
const PANEL_OSD_Y_POS_KEY = 'y-pos';
const PANEL_OSD_ALLOW_X_RESET = 'x-res';
const PANEL_OSD_ALLOW_Y_RESET = 'y-res';
const PANEL_OSD_FORCE_EXPAND = 'force-expand';
const PANEL_OSD_TEST_DELAY = 'test-delay';
const PANEL_OSD_TEST_NOTIFICATION = 'test-notification';

const PanelOsdPrefsWidget = new GObject.Class({
    Name: 'PanelOsdExtension.Prefs.Widget',
    GTypeName: 'PanelOsdExtensionPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);

        this.initWindow();

        this.add(this.MainWidget);
    },

    Window: new Gtk.Builder(),

    initWindow: function() {
        if (this.test_notification)
            this.test_notification = false;

        this.Window.set_translation_domain('gnome-shell-extension-panel-osd');
        this.Window.add_from_file(EXTENSIONDIR + "/panel-osd-settings.ui");

        this.MainWidget = this.Window.get_object("main-widget");

        this.x_scale = this.Window.get_object("scale-x-pos");
        this.x_scale.set_value(this.x_position);
        // prevent from continously updating the value
        this.xScaleTimeout = undefined;
        this.x_scale.connect("value-changed", Lang.bind(this, function(slider) {

            if (this.xScaleTimeout !== undefined)
                Mainloop.source_remove(this.xScaleTimeout);
            this.xScaleTimeout = Mainloop.timeout_add(250, Lang.bind(this, function() {
                this.x_position = slider.get_value();
                return false;
            }));

        }));

        this.y_scale = this.Window.get_object("scale-y-pos");
        this.y_scale.set_value(this.y_position);
        // prevent from continously updating the value
        this.yScaleTimeout = undefined;
        this.y_scale.connect("value-changed", Lang.bind(this, function(slider) {

            if (this.yScaleTimeout !== undefined)
                Mainloop.source_remove(this.yScaleTimeout);
            this.yScaleTimeout = Mainloop.timeout_add(250, Lang.bind(this, function() {
                this.y_position = slider.get_value();
                return false;
            }));

        }));

        this.switch_x_reset = this.Window.get_object("switch-x-reset");
        this.switch_y_reset = this.Window.get_object("switch-y-reset");
        this.reset_button = this.Window.get_object("button-reset");

        this.switch_x_reset.connect("notify::active", Lang.bind(this, function() {
            this.x_reset = arguments[0].active;
            this.reset_button.sensitive = this.x_reset || this.y_reset;
        }));

        this.switch_y_reset.connect("notify::active", Lang.bind(this, function() {
            this.y_reset = arguments[0].active;
            this.reset_button.sensitive = this.x_reset || this.y_reset;
        }));

        this.switch_x_reset.set_active(this.x_reset);
        this.switch_y_reset.set_active(this.y_reset);

        this.reset_button.sensitive = this.x_reset || this.y_reset;

        this.reset_button.connect("clicked", Lang.bind(this, function() {
            if (this.x_reset) this.x_scale.set_value(50);
            if (this.y_reset) this.y_scale.set_value(100);
        }));

        this.switch_force_expand = this.Window.get_object("switch-force-expand");

        this.switch_force_expand.set_active(this.force_expand);

        this.switch_force_expand.connect("notify::active", Lang.bind(this, function() {
            this.force_expand = arguments[0].active;
        }));

        this.delay_scale = this.Window.get_object("scale-test-delay");
        this.delay_scale.set_value(this.test_delay);
        // prevent from continously updating the value
        this.delayScaleTimeout = undefined;
        this.delay_scale.connect("value-changed", Lang.bind(this, function(slider) {

            if (this.delayScaleTimeout !== undefined)
                Mainloop.source_remove(this.delayScaleTimeout);
            this.delayScaleTimeout = Mainloop.timeout_add(250, Lang.bind(this, function() {
                this.test_delay = slider.get_value();
                return false;
            }));

        }));

        this.Window.get_object("button-test").connect("clicked", Lang.bind(this, function() {
            this.test_notification = true;
        }));


    },

    loadConfig: function() {
        this.Settings = Convenience.getSettings(PANEL_OSD_SETTINGS_SCHEMA);
    },

    get x_position() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_double(PANEL_OSD_X_POS_KEY);
    },

    set x_position(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_double(PANEL_OSD_X_POS_KEY, v);
    },

    get y_position() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_double(PANEL_OSD_Y_POS_KEY);
    },

    set y_position(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_double(PANEL_OSD_Y_POS_KEY, v);
    },

    get x_reset() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(PANEL_OSD_ALLOW_X_RESET);
    },

    set x_reset(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(PANEL_OSD_ALLOW_X_RESET, v);
    },

    get y_reset() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(PANEL_OSD_ALLOW_Y_RESET);
    },

    set y_reset(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(PANEL_OSD_ALLOW_Y_RESET, v);
    },

    get force_expand() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(PANEL_OSD_FORCE_EXPAND);
    },

    set force_expand(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(PANEL_OSD_FORCE_EXPAND, v);
    },

    get test_delay() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_double(PANEL_OSD_TEST_DELAY);
    },

    set test_delay(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_double(PANEL_OSD_TEST_DELAY, v);
    },

    get test_notification() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(PANEL_OSD_TEST_NOTIFICATION);
    },

    set test_notification(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(PANEL_OSD_TEST_NOTIFICATION, v);
    }

});

function init() {
    Convenience.initTranslations('gnome-shell-extension-panel-osd');
}

function buildPrefsWidget() {
    let widget = new PanelOsdPrefsWidget();
    widget.show_all();
    return widget;
}
