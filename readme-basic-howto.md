![](https://i.imgur.com/CQz3D2g.png)  
# Basic Guide  
### Info to set up the visuals as the pics [*](https://imgur.com/a/hOpkPr4)
It will be updated with info about extensions

+ **1.** In `Gnome-Tweaks > Fonts`, option `Scaling Factor` to `0,82`
+ **1.a.** Interface font: `SF Pro Display Semibold` size `10` - [**1**](https://github.com/sahibjotsaggu/San-Francisco-Pro-Fonts/blob/master/SF-Pro-Display-Semibold.otf) or [**2**](https://git.teobit.ru/altera/alteraQwars/blob/cded838d7de52d289595d6d36dea40463598ba40/source/San%20Francisco%20Pro/Fonts/SF-Pro-Display-Semibold.ttf)
+ **1.b.** Window Title font: `Ubuntu Medium` size `11`
+ **1.c.** Monoscpace font: `Ubuntu Mono Regular` size `13`
  
    
+ **2.** Download [*Sierra Negra*](https://github.com/thepante/setup/releases/download/0.3/Sierranegra.zip), put it on `~/.themes` folder
+ **2.a.** In `Gnome-Tweaks > Appearance` select `Sierra Negra` on `Applications` and `Shell` themes  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; *If Shell is disabled, you need [User Themes](https://extensions.gnome.org/extension/19/user-themes/) extension*
+ **3.** Download [*Cupertino-macOS iCons*](https://github.com/USBA/Cupertino-macOS-iCons/releases) - put the extracted folder on `~/.icons`
+ **3.a.** In `Gnome-Tweaks > Appearence` select the icon theme on `Icons`


**With that the visuals should look as the pics**


---


### Make software match the visuals
+ **Firefox** - If you are using its dark theme, I recommend use at least [the basic CSS corrections](https://github.com/thepante/setup/tree/master/.mozilla/firefox/X.default/chrome-option2) for fix it on GTK  
+ **Terminal** - Can import and use [this profile](https://raw.githubusercontent.com/thepante/setup/master/gterminal-sierranegra.dconf) (copy code, save as a file with `.dconf` extension, [import it](https://raw.githubusercontent.com/thepante/setup/master/gterminal-sierranegra-readme), remplace the ID with yours, ***check profiles ID*** first and use that 36 digit identification code) or if you want only match de background: color is `#0F1419`
+ **Albert** - Have its own theme (`Sierranegra.qss`) - [Copy this file](https://github.com/thepante/setup/blob/master/.local/share/albert/org.albert.extension.externalextensions/themes/Sierranegra.qss) under that same path showed there. Remember it have to be a `.qss` file.

---
