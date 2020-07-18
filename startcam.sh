#!/bin/bash
apps=("droidcam" "obs")

for app in ${apps[@]}; do
	if ! pgrep -x $app > /dev/null
	then
		$app &
	fi
done

# Start SWS
if ! pgrep -x "SoundWireServer" > /dev/null
then
  /opt/SoundWireServer/SoundWireServer &
fi

# Load & set droidcam_audio
dainput=$(pacmd list-sources | grep droidcam_audio)
if [ -z "$dainput" ]
then
  pacmd load-module module-alsa-source device=hw:Loopback,1,0 source_properties=device.description=droidcam_audio
fi
pacmd set-default-source "alsa_input.hw_Loopback_1_0"

# Open SoundWire client and droidcamx on the phone
adb shell monkey -p com.georgie.SoundWire -v 1
adb shell monkey -p com.dev47apps.droidcamx -v 1 &
