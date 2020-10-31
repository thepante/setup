#!/bin/bash
apps=("droidcam" "obs")

for app in ${apps[@]}; do
	pgrep -x $app > /dev/null || $app &
done

# Start SWS
sws="SoundWireServer"
pgrep -x $sws > /dev/null || /opt/$sws/$sws &

# Load & set droidcam_audio
dainput=$(pacmd list-sources | grep droidcam_audio)
[ -z "$dainput" ] && pacmd load-module module-alsa-source device=hw:Loopback,1,0 source_properties=device.description=droidcam_audio

pacmd set-default-source "alsa_input.hw_Loopback_1_0"

# Enable USB tethering
adb shell svc usb setFunctions rndis

# Open SoundWire and droidcam clients on the phone
adb shell monkey -p com.georgie.SoundWire -v 1
adb shell monkey -p com.dev47apps.droidcamx -v 1 &
