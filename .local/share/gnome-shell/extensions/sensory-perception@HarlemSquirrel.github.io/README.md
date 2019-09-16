# Sensory Perception
### A GNOME Shell Extension

Forked from https://github.com/xtranophilist/gnome-shell-extension-sensors

## Installation

### Manual

```
git clone https://github.com/HarlemSquirrel/gnome-shell-extension-sensory-perception.git
ln -s ~/gnome-shell-extension-sensory-perception ~/.local/share/gnome-shell/extensions/sensory-perception@HarlemSquirrel.github.io
```

## Customizing labels

You may want to set the labels of your sensors to something like 'CPU' instead of 'temp1'. Every motherboard is different so you will need to set these labels manually. I created [lm-sensors-chip-labels](https://github.com/HarlemSquirrel/lm-sensors-chip-labels) where I am adding the files I need for my machines. Feel free to open a PR and contribute!

## Troubleshooting

One of the best ways to troubleshoot is to watch the logs with `journalctl` and restart the extension. You can reload this extension with the handy [Gnome Shell Extension Reloader](https://extensions.gnome.org/extension/1137/gnome-shell-extension-reloader/) extension.

```
journalctl --since="`date '+%Y-%m-%d %H:%M'`" -f | grep sensory-perception
```

## Build a zip file for distribution

    # Check for lints first
    npm run test
    # Then build a zip file
    npm run build
