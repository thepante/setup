/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/* ========================================================================================================
 * chooserButtonWidgets.js - A library to provide a more widgets and tween effects of Gnome Classic Settings -
 * ========================================================================================================
 */
const Lang = imports.lang;
const Cairo = imports.cairo;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;

const _ = Gettext.gettext;

const TWEEN_SHAPES = [
    "Quad", "Cubic", "Quart", "Quint", "Sine", "Expo",
    "Circ", "Elastic", "Back", "Bounce"
];

const TWEEN_DIRECTIONS = ["In", "Out", "InOut", "OutIn"]
const EFFECT_STYLE_NAMES = {
    "none":         _("None"),
    "scale":        _("Scale"),
    "fade":         _("Fade"),
    "blend":        _("Blend"),
    "move":         _("Move"),
    "flyUp":        _("Fly up"),
    "flyDown":      _("Fly down"),
    "traditional":  _("Traditional")
};

const PREVIEW_HEIGHT = 48;
const PREVIEW_WIDTH = 96;
const ANIMATION_DURATION = 800;
const ANIMATION_FRAME_RATE = 20;

const BaseChooserButton = new GObject.Class({
    Name: 'ClassicGnome.BaseChooserButton',
    GTypeName: 'ClassicGnomeBaseChooserButton',
    Extends: Gtk.Button,

    _init: function(has_button_label) {//has_button_label=false
        this.parent();
        this.set_valign(Gtk.Align.CENTER);
        this.menu = new Gtk.Menu();
        this.button_box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });
        this.button_image = new Gtk.Image();
        this.button_box.add(this.button_image);
        if (has_button_label) {
            this.button_label = new Gtk.Label();
            this.button_box.add(this.button_label);
        }
        this.add(this.button_box);
        this.connect("released", Lang.bind(this, this._on_button_clicked));
    },

    popup_menu_below_button: function(menu) {
        // the introspection for GtkMenuPositionFunc seems to change with each Gtk version,
        // this is a workaround to make sure we get the menu and the widget
        let window = this.get_window();
        let screen = window.get_screen();
        let monitor = screen.get_monitor_at_window(window);

        let warea = screen.get_monitor_workarea(monitor);
        let wrect = this.get_allocation();
        let mrect = menu.get_allocation();

        let [unused_var, window_x, window_y] = window.get_origin();

        // Position left edge of the menu with the right edge of the button
        let x = window_x + wrect.x + wrect.width;
        // Center the menu vertically with respect to the monitor
        let y = warea.y + (warea.height / 2) - (mrect.height / 2);

        // Now, check if we're still touching the button - we want the right edge
        // of the button always 100% touching the menu

        if (y > (window_y + wrect.y))
            y = y - (y - (window_y + wrect.y));
        else if ((y + mrect.height) < (window_y + wrect.y + wrect.height))
            y = y + ((window_y + wrect.y + wrect.height) - (y + mrect.height));

        let push_in = true; // push_in is true so all menu is always inside screen
        return [x, y, push_in];
    },

    _on_button_clicked: function(widget) {
        this.menu.show_all();
        this.menu.popup(null, null, Lang.bind(this, this.popup_menu_below_button), this, 1, Date.now());
    },
});

const PictureChooserButton = new GObject.Class({
    Name: 'ClassicGnome.PictureChooserButton',
    GTypeName: 'ClassicGnomePictureChooserButton',
    Extends: BaseChooserButton,

    _init: function(num_cols, button_picture_size, menu_pictures_size, has_button_label) {
        //num_cols=4, button_picture_size=null, menu_pictures_size=null, has_button_label=false
        this.parent(has_button_label);

        this.num_cols = num_cols;
        this.button_picture_size = button_picture_size;
        this.menu_pictures_size = menu_pictures_size;
        this.row = 0;
        this.col = 0;
        this.progress = 0.0;

        let context = this.get_style_context();
        context.add_class("gtkstyle-fallback");

        this.connect_after("draw", Lang.bind(this, this.on_after_draw));
    },

    on_after_draw: function(widget, cr, data) { //data=null
        if (this.progress == 0.0)
            return false;
        let box = this.get_allocation();

        let context = this.get_style_context();
        let c = context.get_background_color(Gtk.StateFlags.SELECTED);

        let max_length = box.width * 0.6;
        let start = (box.width - max_length) / 2;
        let y = box.height - 5;

        cr.save();

        cr.setSourceRGBA(c.red, c.green, c.blue, c.alpha);
        cr.setLineWidth(3);
        cr.setLineCap(1);
        cr.moveTo(start, y);
        cr.lineTo(start + (this.progress * max_length), y);
        cr.stroke();

        cr.restore();
        return false;
    },

    increment_loading_progress: function(inc) {
        let progress = this.progress + inc;
        this.progress = Math.min(1.0, progress);
        this.queue_draw();
    },

    reset_loading_progress: function() {
        this.progress = 0.0;
        this.queue_draw();
    },

    set_picture_from_file: function(path) {
        if (Gio.file_new_for_path(path).query_exists(null)) {
            let pixbuf;
            if (this.button_picture_size == null) {
                pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
            } else {
                pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, -1, this.button_picture_size, true);
            }
            this.button_image.set_from_pixbuf(pixbuf);
        }
    },

    set_button_label: function(label) {
        this.button_label.set_markup(label);
    },

    _on_picture_selected: function(menuitem, path, callback, id) {//id=null
        let result = null;
        if (id != null) {
            result = callback(path, id);
        } else {
            result = callback(path);
        }
        if (result) {
            this.set_picture_from_file(path);
        }
    },

    clear_menu: function() {
        let menu = this.menu;
        this.menu = new Gtk.Menu();
        this.row = 0;
        this.col = 0;
        menu.destroy();
    },

    add_picture: function(path, callback, title, id) {//title=null, id=null
        if (Gio.file_new_for_path(path).query_exists(null)) {
            let pixbuf;
            if (this.menu_pictures_size == null) {
                pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
            } else {
                pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, -1, this.menu_pictures_size, true);
            }
            let image = Gtk.Image.new_from_pixbuf(pixbuf);

            let menuitem = new Gtk.MenuItem();
            if (title != null) {
                let vbox = new Gtk.VBox();
                vbox.pack_start(image, false, false, 2);
                let label = new Gtk.Label();
                label.set_text(title);
                vbox.pack_start(label, false, false, 2);
                menuitem.add(vbox);
            } else {
                menuitem.add(image);
            }
            if (id != null)
                menuitem.connect('activate', Lang.bind(this, this._on_picture_selected, path, callback, id));
            else
                menuitem.connect('activate', Lang.bind(this, this._on_picture_selected, path, callback));
            this.menu.attach(menuitem, this.col, this.col + 1, this.row, this.row + 1);
            this.col = (this.col+1) % this.num_cols;
            if (this.col == 0)
                this.row = this.row + 1;
        }
    },

    add_separator: function() {
        this.row = this.row + 1;
        this.menu.attach(new Gtk.SeparatorMenuItem(), 0, this.num_cols, this.row, this.row + 1);
    },

    add_menuitem: function(menuitem) {
        this.row = this.row + 1;
        this.menu.attach(menuitem, 0, this.num_cols, this.row, this.row + 1);
    },
});

const DateChooserButton = new GObject.Class({
    Name: 'ClassicGnome.DateChooserButton',
    GTypeName: 'ClassicGnomeDateChooserButton',
    Extends: Gtk.Button,
    Signals: {
        'date-changed': {
            flags: GObject.SignalFlags.RUN_LAST,
            param_types: [ GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT ]
        },
    },

    _init: function() {
        this.parent();

        let [year, month, day] = GLib.DateTime.new_now_local().get_ymd();
        this.year = year;
        this.month = month;
        this.day = day;

        this.connect("clicked", Lang.bind(this, this.on_button_clicked));
    },

    on_button_clicked: function(args) {
        this.dialog = new Gtk.Dialog({
            transient_for: this.get_toplevel(),
            title: _("Select a date"),
            flags: Gtk.DialogFlags.MODAL,
            buttons: [Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL,
                      Gtk.STOCK_OK, Gtk.ResponseType.OK]
        });

        let content = this.dialog.get_content_area();

        let calendar = new Gtk.Calendar();
        content.pack_start(calendar, true, true, 0);
        calendar.select_month(this.month - 1, this.year);
        calendar.select_day(this.day);

        function select_today() {
            let date = GLib.DateTime.new_now_local().get_ymd();
            calendar.select_month(date[1] - 1, date[0]);
            calendar.select_day(date[2]);
        }
        let today = new Gtk.Button({ label: _("Today") });
        today.connect("clicked", Lang.bind(this, select_today));
        content.pack_start(today, false, false, 0);

        content.show_all();

        response = this.dialog.run();

        if (response == Gtk.ResponseType.OK) {
            date = calendar.get_date();
            this.set_date(date[0], date[1] + 1, date[2]); //calendar uses 0 based month
            this.emit("date-changed", this.year, this.month, this.day);
        }
        this.dialog.destroy();

    },

    get_date: function() {
        return [this.year, this.month, this.day];
    },

    set_date: function(year, month, day) {
        this.year = year;
        this.month = month;
        this.day = day;

        let date = GLib.DateTime.new_local(year, month, day, 1, 1, 1);
        let date_string = date.format(_("%B %e, %Y"));
        this.set_label(date_string);
    },
});

function draw_window(context, x, y, color, alpha, scale) { //alpha = 1, scale = 1
    if(!scale || scale === undefined)
        scale = 1;
    if(!alpha || alpha === undefined)
        alpha = 1;
    if (scale > 0) {
        let alpha = Math.min(Math.max(alpha, 0), 1);

        context.set_source_rgba(color.red, color.green, color.blue, alpha);
        context.save();
        context.translate(x, y);
        context.scale(scale, scale);

        context.rectangle(-PREVIEW_WIDTH / 4.0, -PREVIEW_HEIGHT / 4.0, PREVIEW_WIDTH / 2.0, PREVIEW_HEIGHT / 2.0);
        context.fill();
        context.restore();
    }
}

// menu item for TweenChooserButton
const EffectMenuItem = new GObject.Class({
    Name: 'ClassicGnome.EffectMenuItem',
    GTypeName: 'ClassicGnomeEffectMenuItem',
    Extends: Gtk.MenuItem,

    _init: function() {
        this.parent();
        this.effect_type = "none";
        this.animating = false;
        this.timer = null;

        this.drawing = new Gtk.DrawingArea();
        this.drawing.connect("draw", Lang.bind(this, this.draw));
        this.drawing.set_size_request(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        this.styleContext = this.drawing.get_style_context();

        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this.add(box);

        this.connect("enter-notify-event", Lang.bind(this, this.start_animation));
        this.connect("leave-notify-event", Lang.bind(this, this.stop_animation));
        box.add(this.drawing);

        let label = new Gtk.Label();
        box.add(label);
        label.set_text(EFFECT_STYLE_NAMES[this.effect_type]);
    },

    start_animation: function(args) {
        if (this.hasOwnProperty("animate")) {
            this.animating = true;
            this.elapsed = 0;
            this.drawing.queue_draw();

            this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ANIMATION_FRAME_RATE, Lang.bind(this, this.advance_animation));
        }
    },

    stop_animation: function(args) {
        this.animating = false;
        if (this.timer) {
            GLib.source_remove(this.timer);
            this.timer = null;
        }

        this.drawing.queue_draw();
    },

    advance_animation: function() {
        if (this.elapsed > ANIMATION_DURATION)
            this.stop_animation();
        this.elapsed += ANIMATION_FRAME_RATE;
        this.drawing.queue_draw();

        return true;
    },

    draw: function(widget, context) {
        let x = PREVIEW_WIDTH / 2.;
        let y = PREVIEW_HEIGHT / 2.;
        let color = this.get_color();

        if (this.animating) {
            let percent_complete = this.elapsed / ANIMATION_DURATION;
            this.animate(context, x, y, percent_complete, color);
        } else {
            this.draw_preview(context, x, y, color);
            //value = this.transition(this.state % this.duration, 0, 1, this.duration - 1);
        }
    },

    get_color: function() {
        if (this.animating)
            return this.styleContext.get_color(Gtk.StateFlags.NORMAL);
        return this.styleContext.get_background_color(Gtk.StateFlags.SELECTED);
    },
});

// The following classes contain the functions to draw effect previews. To add a new effect,
// you will only need to include the draw_preview function. To provide an animation preview,
// you will also need to include the animate fuction. You will also need to add your new effect
// to EFFECT_STYLES_NAME above

const EffectMenuItemnone = new GObject.Class({
    Name: 'EffectMenuItem.none',
    GTypeName: 'EffectMenuItemnone',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        draw_window(context, x, y, color, 1.);
    },
});

const EffectMenuItemscale = new GObject.Class({
    Name: 'EffectMenuItem.scale',
    GTypeName: 'EffectMenuItemscale',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        let steps = 3;
        for (let i = 0; i < steps; i++) {
            draw_window(context, x, y, color, (steps - i) * 1.0 / steps, (i + 1.0) / steps);
        }
    },

    animate: function(context, x, y, percent_complete, color) {
        let scale = 1 - percent_complete;
        draw_window(context, x, y, color, null, scale);
    },
});

const fade = new GObject.Class({
    Name: 'EffectMenuItem.fade',
    GTypeName: 'EffectMenuItemfade',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        draw_window(context, x, y, color, 0.5);
    },

    animate: function(context, x, y, percent_complete, color) {
        let alpha = 1 - percent_complete;
        draw_window(context, x, y, color, alpha);//=alpha
    },
});

const EffectMenuItemblend = new GObject.Class({
    Name: 'EffectMenuItem.blend',
    GTypeName: 'EffectMenuItemblend',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        let steps = 3;
        for (let i = 0; i < steps; i++) {
            draw_window(context, x, y, color, (steps - i) * 1.0 / steps, 1 + i / (steps - 1.0) / 2);
        }
    },

    animate: function(context, x, y, percent_complete, color) {
        let scale = 1 + percent_complete / 2;
        let alpha = 1 - percent_complete;
        draw_window(context, x, y, color, alpha, scale);//alpha=alpha, scale=scale
    },
});

const EffectMenuItemtraditional = new GObject.Class({
    Name: 'EffectMenuItem.traditional',
    GTypeName: 'EffectMenuItemtraditional',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        let gradient = new Cairo.LinearGradient(x, y * 2, x, y);
        gradient.add_color_stop_rgba(0, color.red, color.green, color.blue, 0);
        gradient.add_color_stop_rgb(1, color.red, color.green, color.blue);
        context.set_source(gradient);
        context.move_to(x, y * 2);
        context.line_to(x * 1.5, y * 1.5);
        context.line_to(x * 1.5, y * 0.5);
        context.line_to(x * 0.5, y * 0.5);
        context.line_to(x * 0.5, y * 1.5);
        context.fill();
    },

    animate: function(context, x, y, percent_complete, color) {
        y *= 1 + percent_complete;
        let scale = 1 - percent_complete;
        let alpha = 1 - percent_complete;
        draw_window(context, x, y, color, alpha, scale);//alpha=alpha, scale=scale
    },
});

const EffectMenuItemmove = new GObject.Class({
    Name: 'EffectMenuItem.move',
    GTypeName: 'EffectMenuItemmove',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        let gradient = new Cairo.LinearGradient(0, 0, x, y);
        gradient.add_color_stop_rgba(0, color.red, color.green, color.blue, 0);
        gradient.add_color_stop_rgb(1, color.red, color.green, color.blue);
        context.set_source(gradient);
        context.move_to(x / 5, y / 5);
        context.line_to(x * 1.5, y * 0.5);
        context.line_to(x * 1.5, y * 1.5);
        context.line_to(x * 0.5, y * 1.5);
        context.fill();
    },

    animate: function(context, x, y, percent_complete, color) {
        let remain = 1 - percent_complete;
        draw_window(context, x*remain, y*remain, color, null, remain);//scale=remain
    },
});

const EffectMenuItemflyUp = new GObject.Class({
    Name: 'ClassicGnome.flyUp',
    GTypeName: 'ClassicGnomeflyUp',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        let gradient = new Cairo.LinearGradient(0, y * 2, 0, y * 1.5);
        gradient.add_color_stop_rgba(0, color.red, color.green, color.blue, 0);
        gradient.add_color_stop_rgb(1, color.red, color.green, color.blue);
        context.set_source(gradient);
        context.rectangle(x / 2, y / 2, x, y * 1.5);
        context.fill();
    },

    animate: function(context, x, y, percent_complete, color) {
        y *= 1 - percent_complete * 1.5;
        draw_window(context, x, y, color);
    },
});

const EffectMenuItemflyDown = new GObject.Class({
    Name: 'EffectMenuItem.flyDown',
    GTypeName: 'EffectMenuItemflyDown',
    Extends: EffectMenuItem,

    _init: function() {
        this.parent();
    },

    draw_preview: function(context, x, y, color) {
        let gradient = new Cairo.LinearGradient(0, 0, 0, y / 2);
        gradient.add_color_stop_rgba(0, color.red, color.green, color.blue, 0);
        gradient.add_color_stop_rgb(1, color.red, color.green, color.blue);
        context.set_source(gradient);
        context.rectangle(x / 2, 0, x, y * 1.5);
        context.fill();
    },

    animate: function(context, x, y, percent_complete, color) {
        y *= 1 + percent_complete * 1.5;
        draw_window(context, x, y, color);
    },
});

// a button to select tweens
const TweenChooserButton = new GObject.Class({
    Name: 'ClassicGnome.TweenChooserButton',
    GTypeName: 'ClassicGnomeTweenChooserButton',
    Extends: BaseChooserButton,
    Properties: {
        "tween": GObject.ParamSpec.string(
            "tween", "tween value",
            "Value of the selected tween",
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            "foobar"
        ),
    },

    _init: function() {
        this.parent();
        this.tween = "";
        this.set_size_request(128, -1);
        this.build_menuitem("None", 0, 0);
        let row = 1;
        for (let pos in TWEEN_SHAPES) {
            let suffix = TWEEN_SHAPES[pos];
            let col = 0;
            for (let posPre in TWEEN_DIRECTIONS) {
                let prefix = TWEEN_SHAPES[posPre];
                this.build_menuitem(prefix + suffix, col, row);
                col += 1;
            }
            row += 1;
        }
    },

    build_menuitem: function(name, col, row) {
        let menuitem = new TweenMenuItem("ease" + name);
        menuitem.connect("activate", Lang.bind(this, this.change_value));
        this.menu.attach(menuitem, col, col + 1, row, row + 1);
    },

    change_value: function(widget) {
        this.props.tween = widget.tween_type;
    },

    do_get_property: function(prop) {
        if (prop.name == 'tween')
            return this.tween;
        else
            throw new Error("unknown property %s".format(prop.name));
    },

    do_set_property: function(prop, value) {
        if (prop.name == 'tween') {
            if (value != this.tween) {
                this.tween = value;
                this.set_label(this.tween);
            }
        } else {
            throw Exception("unknown property %s".format(prop.name));
        }
    },
});

// menu item for TweenChooserButton
const TweenMenuItem = new GObject.Class({
    Name: 'ClassicGnome.TweenMenuItem',
    GTypeName: 'ClassicGnomeTweenMenuItem',
    Extends: Gtk.MenuItem,

    _init: function(tween_type) {
        this.parent();

        this.animating = false;
        this.timer = null;

        this.tween_type = tween_type;
        //this.tween_function = getattr(tweenEquations, tween_type);

        this.vbox = new Gtk.VBox();
        this.add(this.vbox);

        let box = new Gtk.Box();
        this.vbox.add(box);

        this.graph = new Gtk.DrawingArea();
        box.add(this.graph);
        this.graph.set_size_request(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        this.graph.connect("draw", Lang.bind(this, this.draw_graph));

        this.arrow = new Gtk.DrawingArea();
        box.pack_end(this.arrow, false, false, 0);
        this.arrow.set_size_request(5, PREVIEW_HEIGHT);
        this.arrow.connect("draw", Lang.bind(this, this.draw_arrow));

        this.connect("enter-notify-event", Lang.bind(this, this.start_animation));
        this.connect("leave-notify-event", Lang.bind(this, this.stop_animation));

        let label = new Gtk.Label();
        this.vbox.add(label);
        label.set_text(tween_type);
    },

    draw_graph: function(widget, context) {
        let width = PREVIEW_WIDTH - 2.0;
        let height = PREVIEW_HEIGHT / 8.0;

        let color, value;
        let style = widget.get_style_context();
        if (this.animating) {
            color = style.get_background_color(Gtk.StateFlags.SELECTED);
        } else {
            color = style.get_color(Gtk.StateFlags.NORMAL);
        }
        context.set_source_rgb(color.red, color.green, color.blue);

        context.move_to(1, height * 6);
        for (let i; i < parseInt(width); i++) {
            value = this.tween_function(i + 1., height * 6, -height * 4, width);
            context.line_to(i + 2, value);
        }
        context.stroke();
    },

    draw_arrow: function(widget, context) {
        if (this.animating) {
            let height = PREVIEW_HEIGHT / 8.0;

            let style = widget.get_style_context();
            let color = style.get_color(Gtk.StateFlags.NORMAL);
            context.set_source_rgb(color.red, color.green, color.blue);

            let value = this.tween_function(this.elapsed/ANIMATION_DURATION, height * 6, -height * 4, 1);
            context.arc(5, value, 5, math.pi / 2, math.pi * 1.5);
            context.fill();
        }
    },

    start_animation: function(args) {
        this.animating = true;
        this.elapsed = 0;
        this.arrow.queue_draw();
        this.graph.queue_draw();

        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ANIMATION_FRAME_RATE, Lang.bind(this, this.advance_animation));
    },

    stop_animation: function(args) {
        this.animating = false;
        if (this.timer) {
            GLib.source_remove(this.timer);
            this.timer = null;
        }

        this.arrow.queue_draw();
        this.graph.queue_draw();
    },

    advance_animation: function() {
        this.elapsed += ANIMATION_FRAME_RATE;
        if (this.elapsed >= ANIMATION_DURATION) {
            this.timer = null;
            return false;
            // this.stop_animation();
        }
        this.arrow.queue_draw();
        return true;
    },
});

// a button to select effect types
const EffectChooserButton = new GObject.Class({
    Name: 'ClassicGnome.EffectChooserButton',
    GTypeName: 'ClassicGnomeEffectChooserButton',
    Extends: BaseChooserButton,
    Properties: {
        "effect": GObject.ParamSpec.string(
            "effect", "effect value",
            "Value of the selected effect",
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            "foobar"
        ),
    },

    _init: function(effect_styles) {//effect_styles=null
        this.parent();

        this.effect = "";
        this.effect_styles = (effect_styles == null) ? ["none", "scale"] : effect_styles;

        this.set_size_request(128, -1);

        let row = 0;
        let col = 0;
        for (let pos in this.effect_styles) {
            this.build_menuitem(this.effect_styles[pos], col, row);
            col += 1;
            if (col >= 4) {
                col = 0;
                row += 1;
            }
        }
    },

    build_menuitem: function(effect_type, col, row) {
        global.log("" + effect_type);


        // apply the specific effect type methods onto the base effect type menu item
        //FIXME: Remove the python code
        /*const EffectTypeMenuItem = new GObject.Class({//
            Name: 'MenuItem.' + effect_type,
            GTypeName: 'MenuItem' + effect_type,
            Extends: eval('EffectMenuItem' + effect_type),

            _init: function() {
                this.parent();
            },
        });*/
        /*EffectTypeMenuItem = type(effect_type+"MenuItem",
                                 (global[effect_type], EffectMenuItem),
                                 {"effect_type": effect_type});*/
        let menuitem = eval('new EffectMenuItem' + effect_type); //EffectTypeMenuItem();
        menuitem.connect("activate", Lang.bind(this, this.change_value));
        this.menu.attach(menuitem, col, col + 1, row, row + 1);
    },

    change_value: function(widget) {
        this.props.effect = widget.effect_type;
    },

    do_get_property: function(prop) {
        if (prop.name == 'effect')
            return this.effect;
        else
            throw new Error("unknown property %s".format(prop.name));
    },

    do_set_property: function(prop, value) {
        if (prop.name == 'effect') {
            if (value != this.effect) {
                this.effect = value;
                this.set_label(EFFECT_STYLE_NAMES[this.effect]);
            }
        } else {
            throw new Error("unknown property %s".format(prop.name));
        }
    },
});
