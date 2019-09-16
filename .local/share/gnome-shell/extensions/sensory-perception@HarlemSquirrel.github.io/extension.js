const St = imports.gi.St;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Util = imports.misc.util;
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Shell = imports.gi.Shell;
const Utilities = Me.imports.utilities;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Clutter = imports.gi.Clutter;
const SHELL_VERSION = imports.misc.config.PACKAGE_VERSION;

const Logger = Me.imports.logger.Logger;
const Metadata = Me.metadata;

let settings;

const SensorsItem = new Lang.Class({
  Name: 'SensorsItem',
  Extends: PopupMenu.PopupBaseMenuItem,

  _init: function(type, label, value) {
    this.parent();
    this.connect('activate', function () {
      settings.set_string('main-sensor', label);
    });
    this._label = label;
    this._value = value;

    this.actor.add(new St.Icon({
      style_class: 'system-status-icon',
      icon_name: 'sensors-'+type+'-symbolic',
      icon_size: 16
    }));
    this.actor.add(new St.Label({ text: label }));
    this.actor.add(new St.Label({ text: value }), { align: St.Align.END });
  },

  getPanelString: function() {
    if(settings.get_boolean('display-label'))
      return '%s: %s'.format(this._label, this._value);
    else
      return this._value;
  },

  setMainSensor: function() {
    this.setOrnament(PopupMenu.Ornament.DOT);
  },

  getLabel: function() {
    return this._label;
  },
});

const SensorsMenuButton = new Lang.Class({
  Name: 'SensorsMenuButton',

  Extends: PanelMenu.Button,

  _init: function(){
    this.parent(null, 'sensorMenu');

    this._sensorsOutput = '';
    this._hddtempOutput = '';

    this.statusLabel = new St.Label({ text: '\u2026', y_expand: true, y_align: Clutter.ActorAlign.CENTER });

    this.menu.removeAll();
    this.actor.add_actor(this.statusLabel);

    this.sensorsArgv = Utilities.detectSensors();

    if (settings.get_boolean('display-hdd-temp')){
      this.hddtempArgv = Utilities.detectHDDTemp();
    }

    this.udisksProxies = [];
    Utilities.UDisks.getDriveAtaProxies(Lang.bind(this, function(proxies) {
      this.udisksProxies = proxies;
      this._updateDisplay(this._sensorsOutput, this._hddtempOutput);
    }));

    this._settingsChanged = settings.connect('changed', Lang.bind(this, this._querySensors));
    this.connect('destroy', Lang.bind(this, this._onDestroy));

    // don't postprone the first call by update-time.
    this._querySensors();

    this._eventLoop = Mainloop.timeout_add_seconds(settings.get_int('update-time'), Lang.bind(this, function (){
      this._querySensors();
      // readd to update queue
      return true;
    }));
  },

  _onDestroy: function(){
    Mainloop.source_remove(this._eventLoop);
    this.menu.removeAll();
    settings.disconnect(this._settingsChanged);
  },

  _querySensors: function(){
    if (typeof this.sensorsArgv !== 'undefined') {
      // Logger.debug('Querying sensors with ' + this.sensorsArgv);
      this._sensorsFuture = new Utilities.Future(this.sensorsArgv, Lang.bind(this,function(stdout) {
        this._sensorsOutput = stdout;
        this._updateDisplay(this._sensorsOutput, this._hddtempOutput);
        this._sensorsFuture = undefined;
      }));
    } else {
      Logger.error('SensorsMenuButton _querySensors: sensors program not found!');
    }

    if (typeof this.hddtempArgv !== 'undefined') {
      this._hddtempFuture = new Utilities.Future(this.hddtempArgv, Lang.bind(this,function(stdout){
        this._hddtempOutput = stdout;
        this._updateDisplay(this._sensorsOutput, this._hddtempOutput);
        this._hddtempFuture = undefined;
      }));
    }
  },

  _updateDisplay: function(sensorsOutput, hddtempOutput){
    const DisplayFanRPM = settings.get_boolean('display-fan-rpm');
    const DisplayVoltage = settings.get_boolean('display-voltage');

    let tempInfo = Array();
    let fanInfo = Array();
    let voltageInfo = Array();

    tempInfo = Utilities.parseSensorsOutput(sensorsOutput,Utilities.parseSensorsTemperatureLine);
    tempInfo = tempInfo.filter(Utilities.filterTemperature);
    if (DisplayFanRPM){
      fanInfo = Utilities.parseSensorsOutput(sensorsOutput,Utilities.parseFanRPMLine);
      fanInfo = fanInfo.filter(Utilities.filterFan);
    }
    if (DisplayVoltage){
      voltageInfo = Utilities.parseSensorsOutput(sensorsOutput,Utilities.parseVoltageLine);
    }

    if(this.hddtempArgv)
      tempInfo = tempInfo.concat(Utilities.parseHddTempOutput(hddtempOutput, !(/nc$/.exec(this.hddtempArgv[0])) ? ': ' : '|'));

    tempInfo = tempInfo.concat(Utilities.UDisks.createListFromProxies(this.udisksProxies));

    tempInfo.sort(function(a,b) { return a.label.localeCompare(b.label); });
    fanInfo.sort(function(a,b) { return a.label.localeCompare(b.label); });
    voltageInfo.sort(function(a,b) { return a.label.localeCompare(b.label); });

    this.menu.removeAll();

    const Section = new PopupMenu.PopupMenuSection("Temperature");

    if (this.sensorsArgv && tempInfo.length > 0){
      const sensorsList = new Array();
      let sum = 0; //sum
      let max = 0; //max temp
      let allCoreTemps = '';
      for (const temp of tempInfo){
        sum += temp.temp;
        if (temp.temp > max)
          max = temp.temp;

        sensorsList.push(new SensorsItem('temperature', temp.label, this._formatTemp(temp.temp)));
        // Logger.debug('Detected Shell version: ' + SHELL_VERSION);
        const IncludesCore = SHELL_VERSION < '3.26' ? temp.label.contains('Core') : temp.label.includes('Core');
        if (IncludesCore) {
          if (temp.high <= temp.temp) {
            allCoreTemps += ("!");
          }
          allCoreTemps += _("%s ").format(this._formatTemp(temp.temp));
        }
      }

      if (tempInfo.length > 0){
        sensorsList.push(new PopupMenu.PopupSeparatorMenuItem());

        // Add average and maximum entries
        sensorsList.push(new SensorsItem('temperature', _("Average"), this._formatTemp(sum/tempInfo.length)));
        sensorsList.push(new SensorsItem('temperature', _("Maximum"), this._formatTemp(max)));
        sensorsList.push(new SensorsItem('temperature', _("All Cores"), allCoreTemps));

        if(fanInfo.length > 0 || voltageInfo.length > 0)
          sensorsList.push(new PopupMenu.PopupSeparatorMenuItem());
      }

      for (const fan of fanInfo){
        sensorsList.push(new SensorsItem('fan', fan.label, _("%drpm").format(fan['rpm'])));
      }
      if (fanInfo.length > 0 && voltageInfo.length > 0){
        sensorsList.push(new PopupMenu.PopupSeparatorMenuItem());
      }
      for (const voltage of voltageInfo){
        sensorsList.push(new SensorsItem('voltage', voltage.label, _("%s%.2fV").format(((voltage['volt'] >= 0) ? '+' : '-'), voltage['volt'])));
      }

      this.statusLabel.set_text(_("N/A")); // Just in case

      for (const item of sensorsList) {
        if(item instanceof SensorsItem) {
          if (settings.get_string('main-sensor') == item.getLabel()) {

            // Configure as main sensor and set panel string
            item.setMainSensor();
            this.statusLabel.set_text(item.getPanelString());
          }
        }
        Section.addMenuItem(item);
      }

      // separator
      Section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      const item = new PopupMenu.PopupBaseMenuItem();
      // HACK: span and expand parameters don't work as expected on Label, so add an invisible
      // Label to switch columns and not totally break the layout.
      item.actor.add(new St.Label({ text: '' }));
      item.actor.add(new St.Label({ text: _("Sensors Settings") }));
      item.connect('activate', Lang.bind(this, function () {
        const AppSys = Shell.AppSystem.get_default();
        const App = AppSys.lookup_app('gnome-shell-extension-prefs.desktop');
        const AppInfo = App.get_app_info();
        const Timestamp = global.display.get_current_time_roundtrip();
        AppInfo.launch_uris(
          ['extension:///' + Metadata.uuid],
          global.create_app_launch_context(Timestamp, -1)
        );
      }));
      Section.addMenuItem(item);
    } else {
      this.statusLabel.set_text(_("Error"));

      const Item = new PopupMenu.PopupMenuItem(
        (this.sensorsArgv
          ? _("Please run sensors-detect as root.")
          : _("Please install lm_sensors.")) + "\n" + _("If this doesn\'t help, click here to report with your sensors output!")
      );
      Item.connect('activate',function() {
        Util.spawn(["xdg-open", Metadata.url + '/issues']);
      });
      Section.addMenuItem(Item);
    }

    this.menu.addMenuItem(Section);
  },

  _toFahrenheit: function(c){
    return ((9/5)*c+32);
  },

  _formatTemp: function(value) {
    if (settings.get_string('unit')=='Fahrenheit'){
      value = this._toFahrenheit(value);
    }
    let format = '%.1f';
    if (!settings.get_boolean('display-decimal-value')){
      //ret = Math.round(value);
      format = '%d';
    }
    if (settings.get_boolean('display-degree-sign')) {
      format += '%s';
    }
    return format.format(value, (settings.get_string('unit')=='Fahrenheit') ? "\u00b0F" : "\u00b0C");
  }
});

let sensorsMenu;

function init(extensionMeta) {
  Convenience.initTranslations();
  Convenience.initIcons();
  settings = Convenience.getSettings();
}

function enable() {
  sensorsMenu = new SensorsMenuButton();
  Main.panel.addToStatusArea('sensorsMenu', sensorsMenu, 1, 'right');
}

function disable() {
  sensorsMenu.destroy();
  sensorsMenu = null;
}
