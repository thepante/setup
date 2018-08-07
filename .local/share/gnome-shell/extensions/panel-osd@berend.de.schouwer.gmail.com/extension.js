/* jshint esnext:true */
/*
 *
 *  GNOME Shell Extension Panel OSD
 *
 * Copyright (C) 2014 - 2015
 *     Jens Lody <jens@jenslody.de>,

 *  Idea: Grab MessageTray OSD widget, and give it new .x and .y co-ordinates.
 *
 *  We're grabbing "private" methods (start with _), so expect this to break
 *  with different versions of Gnome Shell.
 *
 *  It was tested with 3.10 to 3.17.4 with various themes.
 *
 *  Most of this code is a direct copy from gnome-shell/js/ui/messageTray.js,
 *  which is released under GPLv2+.
 *
 *  The idea comes from 'Shell OSD' gnome-shell extension by
 *  mpnordland@gmail.com
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
/*
 */
const ExtensionUtils = imports.misc.extensionUtils;
const Config = imports.misc.config;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const St = imports.gi.St;
const Meta = imports.gi.Meta;

const Gettext = imports.gettext.domain('gnome-shell-extension-panel-osd');
const _ = Gettext.gettext;

const PANEL_OSD_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.panel-osd';
const PANEL_OSD_X_POS_KEY = 'x-pos';
const PANEL_OSD_Y_POS_KEY = 'y-pos';
const PANEL_OSD_FORCE_EXPAND = 'force-expand';
const PANEL_OSD_TEST_DELAY = 'test-delay';
const PANEL_OSD_TEST_NOTIFICATION = 'test-notification';

/*
 *  Save MessageTray's original methods.  We're going to change these
 *  in our extension to move the OSD.
 */
let originalExpandMethod;
let originalShowNotification;
let originalUpdateShowingNotification;
let originalHideNotification;

/*
 *  The widget we're interested in
 */
let notificationWidget;
let panel;

/*
 *  We need these constants to call Tween with values consistent to the
 *  MessageTray
 */
const IDLE_TIME = 1000;
const ANIMATION_TIME = 0.2;
const Urgency = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    CRITICAL: 3
};
const State = {
    HIDDEN: 0,
    SHOWING: 1,
    SHOWN: 2,
    HIDING: 3
};

let _availablePrimaryRect = new Meta.Rectangle({
    x: 0,
    y: 0,
    width: 0,
    height: 0
})

function init() {
    Convenience.initTranslations('gnome-shell-extension-panel-osd');
}

let Settings;
let SettingsC;

let showTestNotificationTimeout;

let loadConfig = function() {
    Settings = Convenience.getSettings(PANEL_OSD_SETTINGS_SCHEMA);
    SettingsC = Settings.connect("changed", function() {
        if (getTestNotification()) {
            if (showTestNotificationTimeout !== undefined)
                Mainloop.source_remove(showTestNotificationTimeout);

            showTestNotificationTimeout = Mainloop.timeout_add(getTestDelay(), Lang.bind(this, function() {
                Main.notify("Panel OSD", _("This is just a multiline test-message to show where the notification will be placed and to test expansion (showing details)."));
                return false;
            }));
            setTestNotification(false);
        }
    });
};

let versionAtLeast = function(atleast, current) {
    let currentArray = current.split('.');
    let major = currentArray[0];
    let minor = currentArray[1];
    let point = currentArray[2];
    let atleastArray = atleast.split('.');
    if ((atleastArray[0] < major) ||
        (atleastArray[0] == major &&
         atleastArray[1] < minor) ||
        (atleastArray[0] == major &&
         atleastArray[1] == minor) &&
        (atleastArray[2] == undefined ||
         atleastArray[2] <= point))
        return true;
    return false;
}


let getX_position = function() {
    if (!Settings)
        loadConfig();
    return Settings.get_double(PANEL_OSD_X_POS_KEY);
};

let getY_position = function() {
    if (!Settings)
        loadConfig();
    return Settings.get_double(PANEL_OSD_Y_POS_KEY);
};

let getForce_expand = function() {
    if (!Settings)
        loadConfig();
    return Settings.get_boolean(PANEL_OSD_FORCE_EXPAND);
};

let getTestDelay = function() {
    if (!Settings)
        loadConfig();
    return Math.floor(1000 * Settings.get_double(PANEL_OSD_TEST_DELAY));
};

let getTestNotification = function() {
    if (!Settings)
        loadConfig();
    return Settings.get_boolean(PANEL_OSD_TEST_NOTIFICATION);
};

let setTestNotification = function(v) {
    if (!Settings)
        loadConfig();
    Settings.set_boolean(PANEL_OSD_TEST_NOTIFICATION, v);
};

let updateAvailablePrimaryRect = function() {
    let monitor=Main.layoutManager.primaryMonitor;
    _availablePrimaryRect.x=monitor.x;
    _availablePrimaryRect.y=monitor.y;
    _availablePrimaryRect.width=monitor.width;
    _availablePrimaryRect.height=monitor.height;

    let panelRect = new Meta.Rectangle({ x: panel.x,
                                         y: panel.y,
                                         width: panel.width,
                                         height: panel.height });
    let [panelIntersects, rect] = _availablePrimaryRect.intersect(panelRect);

    if (panelIntersects)
    {
        if (monitor.width == rect.width)
        {
           _availablePrimaryRect.height = monitor.height - rect.height;
            if (monitor.y == rect.y)
                _availablePrimaryRect.y = rect.height;
        }
        if (monitor.height == rect.height)
        {
           _availablePrimaryRect.width = monitor.width - rect.width;
            if (monitor.x == rect.x)
                _availablePrimaryRect.x = rect.width;
        }
    }
};

/*
 *  Copied from MessageTray._showNotification()
 *
 *  We only change the .y and .x values to move the OSD.  We need to copy
 *  the whole method to prevent the animation from moving the OSD across the
 *  entire screen.
 */
let extensionShowNotification = function() {
    this._notification = this._notificationQueue.shift();
    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        this.emit('queue-changed');
    }

    this._userActiveWhileNotificationShown = this.idleMonitor.get_idletime() <= IDLE_TIME;
    if (!this._userActiveWhileNotificationShown) {
        // If the user isn't active, set up a watch to let us know
        // when the user becomes active.
        this.idleMonitor.add_user_active_watch(Lang.bind(this, this._onIdleMonitorBecameActive));
    }

    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        this._banner = this._notification.createBanner();
        this._bannerClickedId = this._banner.connect('done-displaying',
                                                     Lang.bind(this, this._escapeTray));
        this._bannerUnfocusedId = this._banner.connect('unfocused', Lang.bind(this, function() {
            this._updateState();
        }));

        this._bannerBin.add_actor(this._banner.actor);

        this._bannerBin._opacity = 0;
        this._bannerBin.opacity = 0;

        if (getY_position() < 50)
            this._bannerBin.y = Main.layoutManager.monitors[0].height;
        else
            this._bannerBin.y = -this._banner.actor.height;

        this.actor.show();
    } else
    {
        this._notificationClickedId = this._notification.connect('done-displaying',
                                                                 Lang.bind(this, this._escapeTray));
        this._notificationUnfocusedId = this._notification.connect('unfocused', Lang.bind(this, function() {
            this._updateState();
        }));
        this._notificationBin.child = this._notification.actor;

        this._notificationWidget.opacity = 0;
        // JRL changes begin
        //this._notificationWidget.y = 0;
        if (getY_position() < 50)
            this._notificationWidget.y = this.actor.height;
        else
            this._notificationWidget.y = -(Main.layoutManager.monitors[0].y + Main.layoutManager.monitors[0].height);
        // JRL changes end


        this._notificationWidget.show();
    }

    this._updateShowingNotification();

    let [x, y, mods] = global.get_pointer();
    // We save the position of the mouse at the time when we started showing the notification
    // in order to determine if the notification popped up under it. We make that check if
    // the user starts moving the mouse and _onTrayHoverChanged() gets called. We don't
    // expand the notification if it just happened to pop up under the mouse unless the user
    // explicitly mouses away from it and then mouses back in.
    this._showNotificationMouseX = x;
    this._showNotificationMouseY = y;
    // We save the coordinates of the mouse at the time when we started showing the notification
    // and then we update it in _notificationTimeout(). We don't pop down the notification if
    // the mouse is moving towards it or within it.
    this._lastSeenMouseX = x;
    this._lastSeenMouseY = y;
    if (versionAtLeast('3.14', Config.PACKAGE_VERSION)) {
        this._resetNotificationLeftTimeout();
    }
};


/*
 *  Copied from MessageTray._hideNotification()
 *
 *  We only change the .y and .x values to move the OSD.  We need to copy
 *  the whole method to prevent the animation from moving the OSD across the
 *  entire screen.
 */
let extensionHideNotification = function(animate) {
    this._notificationFocusGrabber.ungrabFocus();

    let yPos;
    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        if (getY_position() < 50)
            yPos = Main.layoutManager.monitors[0].y + Main.layoutManager.monitors[0].height;
        else
            yPos = -this._bannerBin.height;

        if (this._bannerClickedId) {
            this._banner.disconnect(this._bannerClickedId);
            this._bannerClickedId = 0;
        }
        if (this._bannerUnfocusedId) {
            this._banner.disconnect(this._bannerUnfocusedId);
            this._bannerUnfocusedId = 0;
        }

    }else
    {
        if (this._notificationExpandedId) {
            this._notification.disconnect(this._notificationExpandedId);
            this._notificationExpandedId = 0;
        }
        // JRL changes begin
        if (getY_position() < 50)
            yPos = this.actor.height;
        else
            yPos = -(Main.layoutManager.monitors[0].y + Main.layoutManager.monitors[0].height);
        // JRL changes end
        if (this._notificationClickedId) {
            this._notification.disconnect(this._notificationClickedId);
            this._notificationClickedId = 0;
        }
        if (this._notificationUnfocusedId) {
            this._notification.disconnect(this._notificationUnfocusedId);
            this._notificationUnfocusedId = 0;
        }
    }

    if (versionAtLeast('3.14', Config.PACKAGE_VERSION)) {
        this._resetNotificationLeftTimeout();
    }
    else
    {
        if (this._notificationLeftTimeoutId) {
            Mainloop.source_remove(this._notificationLeftTimeoutId);
            this._notificationLeftTimeoutId = 0;
            this._notificationLeftMouseX = -1;
            this._notificationLeftMouseY = -1;
        }
    }

    // JRL changes begin
    let theNotification;
    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        theNotification = this._bannerBin;
    }else
    {
        theNotification = this._notificationWidget;
    }
   // JRL changes end


    if (animate) {
        if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
            // JRL changes begin
            this._tween(theNotification, '_notificationState', State.HIDDEN,
                        { y: yPos,
                        // JRL changes end
                          _opacity: 0,
                          time: ANIMATION_TIME,
                          transition: 'easeOutBack',
                          onUpdate: this._clampOpacity,
                          onUpdateScope: this,
                          onComplete: this._hideNotificationCompleted,
                          onCompleteScope: this
                        });
        } else {
            // JRL changes begin
            this._tween(theNotification, '_notificationState', State.HIDDEN,
                        { y: yPos,
                        // JRL changes end
                          opacity: 0,
                          time: ANIMATION_TIME,
                          transition: 'easeOutQuad',
                          onComplete: this._hideNotificationCompleted,
                          onCompleteScope: this
                        });
        }
    } else {
        // JRL changes begin
        Tweener.removeTweens(theNotification);
        theNotification.y = yPos;
        theNotification.opacity = 0;
        // JRL changes end
        this._notificationState = State.HIDDEN;
        this._hideNotificationCompleted();
    }
};


/*
 *  Copied from MessageTray._updateShowingNotification()
 *
 *  We only change the .y and .x values to move the OSD.  We need to copy
 *  the whole method to prevent the animation from moving the OSD across the
 *  entire screen.
 *
 */
let extensionUpdateShowingNotification = function() {
    // JRL changes begin
    // first reset the border-radius to the default
    if (!versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        this._notification._table.set_style('border-radius:;');
        if (getY_position() > 0.1)
        {
            // fix the border-radiuses, depending on the position
            let tl, tr;
            let bl = this._notification._table.get_theme_node().get_border_radius(St.Corner.TOPLEFT);
            let br = this._notification._table.get_theme_node().get_border_radius(St.Corner.TOPRIGHT);
            if (getY_position() >= 99.9)
            {
                tl = this._notification._table.get_theme_node().get_border_radius(St.Corner.BOTTOMLEFT);
                tr = this._notification._table.get_theme_node().get_border_radius(St.Corner.BOTTOMRIGHT);
            }
            else
            {
                tl = bl;
                tr = br;
            }
            this._notification._table.set_style('border-radius: '+tl+'px '+tr+'px '+bl+'px '+br+'px;');
        }
    }
    // JRL changes end
    this._notification.acknowledged = true;
    this._notification.playSound();
    // We auto-expand notifications with CRITICAL urgency, or for which the relevant setting
    // is on in the control center.
    if (this._notification.urgency == Urgency.CRITICAL ||
        // JRL changes begin
        getForce_expand() ||
        // JRL changes end
        this._notification.source.policy.forceExpanded)
        {
            if (versionAtLeast('3.16', Config.PACKAGE_VERSION))
                this._expandBanner(true);
            else
                this._expandNotification(true);
        }


    // JRL changes begin
    let theNotification;
    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        theNotification = this._bannerBin;
    }else
    {
        theNotification =this._notificationWidget;
    }
    // use panel's y and height property to determine the bottom of the top-panel.
    // needed because the "hide top bar" and "hide top panel" use different approaches to hide the
    // top bar.
    // "hide top panel" keeps the height and just moves the panel out of the visible area, so using
    // the panels-height is not enough.
    let yPos;
    updateAvailablePrimaryRect();
    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {

        yPos = (_availablePrimaryRect.height - theNotification.height) * (100-getY_position()) / 100;

    }else
    {
        let yTop = -(Main.layoutManager.bottomMonitor.y + Main.layoutManager.bottomMonitor.height);
        if (Main.layoutManager.bottomMonitor == Main.layoutManager.primaryMonitor)
            yTop += (panel.y + panel.height);
        if (yTop < (-Main.layoutManager.bottomMonitor.height))
            yTop = -Main.layoutManager.bottomMonitor.height;
        let yBottom = -theNotification.height;

        yPos = (yTop - yBottom) * getY_position() / 100 + yBottom;
        //
    }
    theNotification.x = (_availablePrimaryRect.width - theNotification.width) * (getX_position() - 50) / 50;
    // JRL changes end
    // We tween all notifications to full opacity. This ensures that both new notifications and
    // notifications that might have been in the process of hiding get full opacity.
    //
    // We tween any notification showing in the banner mode to the appropriate height
    // (which is banner height or expanded height, depending on the notification state)
    // This ensures that both new notifications and notifications in the banner mode that might
    // have been in the process of hiding are shown with the correct height.
    //
    // We use this._showNotificationCompleted() onComplete callback to extend the time the updated
    // notification is being shown.

    let tweenParams;
    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        tweenParams = { _opacity: 255,
                            // JRL changes begin
                            y: yPos,
                            // JRL changes end
                            time: ANIMATION_TIME,
                            transition: 'easeOutBack',
                            onUpdate: this._clampOpacity,
                            onUpdateScope: this,
                            onComplete: this._showNotificationCompleted,
                            onCompleteScope: this
                          };
    }else
    {
        tweenParams = { opacity: 255,
                            // JRL changes begin
                            y: yPos,
                            // JRL changes end
                            time: ANIMATION_TIME,
                            transition: 'easeOutQuad',
                            onComplete: this._showNotificationCompleted,
                            onCompleteScope: this
                          };
    }

    this._tween(theNotification, '_notificationState', State.SHOWN, tweenParams);
};

/*
 *  Copied from MessageTray._onNotificationExpanded()
 *
 *  We only change the .y and .x values to move the OSD.  We need to copy
 *  the whole method to prevent the animation from moving the OSD across the
 *  entire screen.
 *
 */
let extensiononNotificationExpanded = function() {
    // JRL changes begin
    //let expandedY = - this._notificationWidget.height;
    let yTop = -(Main.layoutManager.monitors[0].y + Main.layoutManager.monitors[0].height);
    if (Main.layoutManager.monitors[0] == Main.layoutManager.primaryMonitor)
        yTop += (panel.y + panel.height);
    if (yTop < (-Main.layoutManager.monitors[0].height))
        yTop = -Main.layoutManager.monitors[0].height;
    let yBottom = -this._notificationWidget.height;

    let expandedY = (yTop - yBottom) * getY_position() / 100 + yBottom;
    // JRL changes end
    this._closeButton.show();

    // Don't animate the notification to its new position if it has shrunk:
    // there will be a very visible "gap" that breaks the illusion.
    if (this._notificationWidget.y < expandedY) {
        this._notificationWidget.y = expandedY;
    } else if (this._notification.y != expandedY) {
        // Tween also opacity here, to override a possible tween that's
        // currently hiding the notification.
        if (versionAtLeast('3.14', Config.PACKAGE_VERSION)) {
            Tweener.addTween(this._notificationWidget,
                             { y: expandedY,
                               opacity: 255,
                               time: ANIMATION_TIME,
                               transition: 'easeOutQuad',
                               // HACK: Drive the state machine here better,
                               // instead of overwriting tweens
                               onComplete: Lang.bind(this, function() {
                                   this._notificationState = State.SHOWN;
                               }),
                             });
        }
        else
        {
            this._tween(this._notificationWidget, '_notificationState', State.SHOWN,
                        { y: expandedY,
                          opacity: 255,
                          time: ANIMATION_TIME,
                          transition: 'easeOutQuad'
                        });
        }
    }
};

/*
 *  Overload the methods.
 */
function enable() {
    if (versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        notificationWidget = Main.messageTray._bannerBin;
    }else
    {
        notificationWidget = Main.messageTray._notificationWidget;
        originalExpandMethod = Main.messageTray._onNotificationExpanded;
        Main.messageTray._onNotificationExpanded = extensiononNotificationExpanded;
    }
    originalShowNotification = Main.messageTray._showNotification;
    Main.messageTray._showNotification = extensionShowNotification;

    originalUpdateShowingNotification = Main.messageTray._updateShowingNotification;
    Main.messageTray._updateShowingNotification = extensionUpdateShowingNotification;

    originalHideNotification = Main.messageTray._hideNotification;
    Main.messageTray._hideNotification = extensionHideNotification;

    panel = Main.layoutManager.panelBox;

    loadConfig();
}


/*
 *  Put everything back.
 */
function disable() {
    if (SettingsC) {
        Settings.disconnect(SettingsC);
        SettingsC = undefined;
    }

    if (showTestNotificationTimeout !== undefined)
        Mainloop.source_remove(showTestNotificationTimeout);

    // reset x-position
    notificationWidget.x = 0;

    Main.messageTray._showNotification = originalShowNotification;
    Main.messageTray._hideNotification = originalHideNotification;
    Main.messageTray._updateShowingNotification = originalUpdateShowingNotification;
    if (!versionAtLeast('3.16', Config.PACKAGE_VERSION)) {
        // remove our (inline-)style, in case we just show a notification, otherwise the radius is drawn incorrect
        if (Main.messageTray._notification)
            Main.messageTray._notification._table.set_style('border-radius:;');
        Main.messageTray._onNotificationExpanded = originalExpandMethod;
    }
}
