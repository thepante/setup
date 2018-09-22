## Note  
My Firefox customization has made under Nightly build 63.0a1, and Gnome (3.28) desktop with Unite extension.  
This userChrome.css has a bug where if cosmetics animations are enabled + open and close tabs, the tab spacing get bugged. The only actual solution is to disable (set to false) `toolkit.cosmeticAnimations.enabled` option in `about:config` page.  

---

Here is an userChrome.css alternative: https://gist.github.com/thepante/d28fe184348eb885eec15de8798719e4  
It may be more compatible capable. 
*Unite* fuction in (this alternative file) line [#128 - #133](https://gist.github.com/thepante/d28fe184348eb885eec15de8798719e4#file-userchrome-css-L129) can be deleted.

