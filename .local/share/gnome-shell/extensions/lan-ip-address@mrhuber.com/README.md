# gnome-extension-lan-ip-address

This is the code behind the GNOME Shell Extension called **LAN IP Address**, available in the GNOME Shell Extension store at  https://extensions.gnome.org/extension/1762/lan-ip-address/

## Impetus

I specifically made this extension because I couldn't find an extension in the store that met my needs.  Often I have multiple IP addresses on my Linux workstation, especially when using Docker, and this would seem to confuse any of the other similar extensions.  The only address I want to see in my top panel is my machine's true (i.e. routable) LAN IP address, the one you would use if you were to SSH to your machine on the LAN.


## How it works
To get this LAN IP address, internally this extension runs a shell command
```sh
ip route get 1.1.1.1
```
The `1.1.1.1` address is Cloudflare DNS, and the above command asks your routing table which interface and source address would be used to reach the gateway that would ultimately reach `1.1.1.1`.  There's nothing special about `1.1.1.1`. You could use any public IP address.  I'm pretty sure doing `ip route` doesn't actually ping or communicate in any way with that address, it simply asks your system routing table how you *would* reach that address *if* you wanted to send packets.

A sample output of the `ip` shell command would look something like this:
```
1.1.1.1 via 192.168.1.1 dev eth0 src 192.168.1.173
```
In the above example response, `192.168.1.1` would be your gateway and the source (src) address to reach that gateway is `192.168.1.173`, and it's this that I interpret as your routable LAN IP address.

Within the (Javascript) extension code, I am simply matching and splitting the string to get just that IP address.



## Known limitations
* In the atypical case that you are working on a LAN not connected to the Internet (such as an isolated lab), you have no route that could reach `1.1.1.1`, so things will not work the way this extension is currently designed.