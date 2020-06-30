// sound-percentage@maestroschan.fr/extension.js
// GPL v3
// Copyright Romain F. T.

const { Clutter, St } = imports.gi;
const Main = imports.ui.main;
const Volume = imports.ui.status.volume;

const ShellVersion = imports.misc.config.PACKAGE_VERSION;
let SIGNAL_ID;

function init() {}

//------------------------------------------------------------------------------

function showLabel(percentage) {
	let volumeIndicator = Main.panel.statusArea.aggregateMenu._volume;
	volumeIndicator._percentageLabel.text = percentage + '%';
}

function updateVolume() {
	let volumeIndicator = Main.panel.statusArea.aggregateMenu._volume;
	let percent = 0;
	let muted, virtMax, volume;
	try {
		muted = volumeIndicator._volumeMenu._output._stream.is_muted;
		virtMax = volumeIndicator._volumeMenu._control.get_vol_max_norm();
	} catch (e) {
		muted = true;
		percent = '?';
	}
	
	if (!muted) {
		volume = volumeIndicator._volumeMenu._output.stream.volume;
		percent = Math.round(volume / virtMax * 100);
	}
	
	showLabel(percent);
}

//------------------------------------------------------------------------------

function enable() {
	let volumeIndicator = Main.panel.statusArea.aggregateMenu._volume;
	volumeIndicator._percentageLabel = new St.Label({
		y_expand: true,
		y_align: Clutter.ActorAlign.CENTER
	});

	let useIndicators = parseInt(ShellVersion.split('.')[1]) < 35;
	if (useIndicators) {
		volumeIndicator.indicators.add(volumeIndicator._percentageLabel);
		volumeIndicator.indicators.add_style_class_name('power-status');
	} else {
		volumeIndicator.add(volumeIndicator._percentageLabel);
		volumeIndicator.add_style_class_name('power-status');
	}

	updateVolume();
	SIGNAL_ID = volumeIndicator._volumeMenu._output.connect('stream-updated', updateVolume);
}

function disable() {
	let volumeIndicator = Main.panel.statusArea.aggregateMenu._volume;
	volumeIndicator._volumeMenu._output.disconnect(SIGNAL_ID);
	volumeIndicator._percentageLabel.destroy();
}

//------------------------------------------------------------------------------

