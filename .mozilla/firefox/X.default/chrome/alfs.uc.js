// ==UserScript==
// @name           alfs.uc.js
// @include        main
// @version        1.4
// @note           u/thepante
// ==/UserScript==

var alfs = document.getElementById("sidebar-box");
var browser = document.getElementById("browser");
var sideB = document.getElementById("sidebar-button");
var sideX = document.getElementById("sidebar-close");
var sidebar = document.getElementById('sidebar');
var clientWidth = document.documentElement.clientWidth;
var ogclass = alfs.className;
var statbnt = 0;
var attachedRight = true;
var selectedpos = "nopyet";
var itsvidplayerm = false;

// Load sidebar in the bushes //
setTimeout(function(e) {alfs.setAttribute("hidden", "true");}, 500);
alfs.checked=true;
alfs.className = ogclass + ' closeit';
sideB.checked=false;

// Get prefs if they exists //
function besomecooler() {
    if (typeof alfsPrefs !== 'undefined') {
        var str = alfsPrefs.position;
        debugM('prefs from file');
    }
    else { justbenormalpls(); var str = alfsPrefs.position;}
    selectedpos = str.toLowerCase();
    if (selectedpos === 'left') {attachedRight = false;}
    return;
} besomecooler();

// Some info for debuggin //
function fromside(f) { if (attachedRight === true) { return "→ "; } else { return "← ";} return;}
function debugM(d)   { if (alfsPrefs.debug === true) { console.log('alfs: ' + fromside() + d);}}
function info() {if (alfsPrefs.classic_mode === true) { var sty = "styleClassic"; } else { var sty = "styleFloat"; }
  return alfsPrefs.position + " → " + selectedpos + " → " + sidePosition() + " → " + attachedRight + " → " + attachedto + " / its fallback?: " + alfsPrefs.itsfallback + " / " + sty; }

// Declaring style rules //
function sidePosition() { if (attachedRight === true) { return "right: 0";} else { return "left: 0";}} 
var attachedto = sidePosition();
var styleFloat = {
  '.sidebar-splitter'             : 'display: none;', 
  '#sidebar-reverse-position'     : 'display: none;',
  '#sidebar-extensions-separator' : 'display: none;',
  '#browser'                      : "overflow: hidden; position: absolute; --sidebar-size:"+ alfsPrefs.height +"; --sidebar-width:"+ alfsPrefs.width +"; --shadow-strong:"+ alfsPrefs.shadow_intensity +";",
  '#appcontent'                   : 'top: 0; bottom: 0; right: 0; left: 0; position: absolute;',
  '#tabbrowser-tabbox'            : 'height: 100% !important; width: 100% !important;',
  '#sidebar-header'               : 'width: 100%;',
  '#sidebar-box'                  : 'position: absolute; height: calc(var(--sidebar-size) - 42px); z-index: 9999;' + attachedto,
  '#sidebar'                      : 'min-width: var(--sidebar-width) !important; min-height: 100%; position: absolute; border-radius: 0 0 0 3px;',
};

var styleClassic={
  '.sidebar-splitter'             : 'display: none;', 
  '#sidebar-reverse-position'     : 'display: none;',
  '#sidebar-extensions-separator' : 'display: none;',
  '#browser'                      : "overflow: hidden; --sidebar-size:"+ alfsPrefs.height +"; --sidebar-width:"+ alfsPrefs.width +"; --shadow-strong:"+ alfsPrefs.shadow_intensity +";",
  '#tabbrowser-tabbox'            : 'height: 100%; width: 100% !important;',
  '#sidebar-header'               : 'width: 100%;',
  '#sidebar-box'                  : 'position: absolute; height: calc(100vh - 72px); width: ' + alfsPrefs.width + ' !important; z-index: 9999;' + attachedto,
  '#sidebar'                      : 'min-width: var(--sidebar-width) !important; min-height: 100%; position: absolute; border-radius: 0 0 0 3px;',
};

// Defaults prefs //
function justbenormalpls() {
    var alfsPrefs = {'itsfallback' : true, 'position' : 'Right', 'width' : '24em', 'height' : '60%', 'shadow_intensity' : 0.1, 'keybind_ctrl' : 1, 'keybind_key' : 88, 'debug' : false, 'classic_mode' : false, };
    console.log('alfs fallback prefs!');
    return;
}

// Apply style rules //
if (alfsPrefs.classic_mode === true) { var styled = styleClassic;} else { var styled = styleFloat;}
Object.entries(styled).forEach(([key, value]) => {
   var ident = document.querySelector(key);
   ident.setAttribute("style", value);
   debugM(key + ' →→ ' + value);
});

// If is float then make draggable with shift+click //
if (alfsPrefs.classic_mode != true){
var m = document.getElementById('sidebar-header');
m.addEventListener('mousedown', mouseDown, false);
window.addEventListener('mouseup', mouseUp, false);
function mouseUp() {window.removeEventListener('mousemove', move, true);}
function mouseDown(e) {if (e.shiftKey) {window.addEventListener('mousemove', move, true);}}}
function vwTOpx(value) { var w = window, x = w.innerWidth, y = w.innerHeight; var result = (x*value)/100; return result; }
function vhTOpx(value) { var w = window, x = w.innerWidth, y = w.innerHeight; var result = (y*value)/100; return result; }

function move(e) {
    var rightX = vwTOpx(100) - e.clientX;
    alfs.style.top = (e.clientY - 65) + 'px';
    if (attachedRight === true) {alfs.style.right = rightX + 'px';}
    else {alfs.style.left = e.clientX + 'px';}
    debugM('L (' + e.clientX + ')[' + vwTOpx(100) + '](' + rightX + ') R || T (' + e.clientY + ')[' + vhTOpx(100) + ']' );
}

// Shortcut modifier key declaration //
function keybindin(m) {
    var modifier = 0;
    if (alfsPrefs.keybind_ctrl === 1) {
        modifier = m.ctrlKey;
        return modifier;
    }
    else if (alfsPrefs.keybind_ctrl === 2) {
        modifier = m.altKey;
        return modifier;
    }
    else if (modifier === 0) {
        return;
    }
}

// Classic mode //
function classicmode() {
  var attach_right = attachedRight === true;
  var attach_left = attachedRight === false;
  var sidebar_visible = statbnt === 1;
  var sidebar_hided = statbnt === 0;
  var appcontent = document.getElementById("appcontent");

  var common_ac = "overflow: hidden; top: 0; bottom: 0; right: 0; left: 0; position: absolute;";
  var common_sb = "position: relative; height: 0 !important; width: 0 !important; z-index: -9999;";
  var common_bw = "margin-right: 0 !important; margin-left: 0 !important; position: absolute;";
  browser.setAttribute("style", styleClassic['#browser'] + common_bw);

    if (attach_right && sidebar_visible) {
      appcontent.setAttribute("style", "overflow: hidden; top: 0; bottom: 0; right: " + alfsPrefs.width + "; left: 0; position: absolute;");
      alfs.setAttribute("style", styleClassic["#sidebar-box"]);
    } 
    else if (attach_left && sidebar_visible) {
      appcontent.setAttribute("style", "overflow: hidden; top: 0; bottom: 0; right: 0; left: " + alfsPrefs.width + "; position: absolute;");
      alfs.setAttribute("style", styleClassic["#sidebar-box"]);
    }
    else if (attach_right || attach_left && sidebar_hided) {
      appcontent.setAttribute("style", common_ac);
      alfs.setAttribute("style", common_sb);
    }
} function detectclassic(){ if (alfsPrefs.classic_mode === true) {classicmode();} return;} detectclassic();

// Video player mode //
function vidPlayerMode(webpage) {
  if (webpage.includes("youtube.com")) {
    var urlRegex = /(\/watch\?v\=)/;
    vidurl = webpage.replace(urlRegex, '/embed/');
    sidebar.src=vidurl+'?autoplay=1';
  }
  else if (webpage.includes("vimeo.com")) {
    var urlRegex = /(vimeo\.com)/;
    vidurl = webpage.replace(urlRegex, 'player.vimeo.com/video');
    sidebar.src=vidurl+'?autoplay=1&title=0&byline=0&portrait=0';
  }
  browser.setAttribute("style", "overflow: hidden; position: absolute; --sidebar-size:262px; --sidebar-width:392px; --shadow-strong:0.1;");
  sidebar.setAttribute("style", styleFloat['#sidebar']+'border-radius: 0px !important;');
  itsvidplayerm = true;
} 

function buttonpip(that){ // extract link from alfs button extension
    debugM('clicked pip button');
    alfsbutton = that.style.cssText.toString();
    regex = /start=(.*?)(?:\s|\?end|$)/g;
    laurl = regex.exec(alfsbutton);

    debugM(laurl[1]);
    vidPlayerMode(laurl[1]);
    doitmf();
}

function pip(link) {doitmf(); vidPlayerMode(link); return;} // Call video player mode

// Show or hide it //
function doitmf() {
  if (statbnt == 0) {
        debugM(statbnt+" open");
        sideB.checked=true;
        alfs.className = ogclass + ' openit';
        alfs.hidden=false;
        statbnt = 1;
        detectclassic();
    }
    else {
        debugM(statbnt+" close");
        sideB.checked=false;
        alfs.className = ogclass + ' closeit';
        alfs.hidden=false;
        statbnt = 0;
        detectclassic();
    }
}
setTimeout(function(){if (sideB.checked === true){sideB.checked = false;}}, 1050); // workaround for button checked on start

// Let it go... //
document.onkeydown = function(e) { // Shortcuts
if (keybindin(e) && e.which === alfsPrefs.keybind_key) {
    e.preventDefault();
    doitmf();
    e.stopPropagation();
}
else if (e.ctrlKey && e.which === 89) { // Link to sidebar
    e.preventDefault();
    navigator.clipboard.readText().then(text => {vidPlayerMode(text);});
    doitmf();
    e.stopPropagation();
}};

sideB.addEventListener('click', function(e){ // Toolbar button
    e.preventDefault();
    doitmf();
    e.stopPropagation();
});

sideX.addEventListener('click', function(e){ // Close (X) sidebar button
    e.preventDefault();
    doitmf();
    e.stopPropagation();
    if (itsvidplayerm === true) { // if is player mode, it has to revert the changes
      sidebar.src='chrome://browser/content/webext-panels.xul';
      browser.setAttribute("style", styleFloat['#browser']);
      sidebar.setAttribute("style", styleFloat['#sidebar']);
      SidebarUI.show('viewBookmarksSidebar'); // as default show bookmarks
      SidebarUI.show("treestyletab_piro_sakura_ne_jp-sidebar-action"); // if exists tst
      itsvidplayerm = false;
    } else {}
});

// Pip button detection //
function thework(e, thetype, fromid){ // do the same for the different types
  var buttonid = fromid;
  e = e || window.event;
  e = e.target || e.srcElement;
  if (e.nodeName === thetype) {
      debugM(e.id);
      if (e.id === buttonid) { // if it is from alfs button extension, launch
        debugM(e.id);
        alfsButtonPa = document.getElementById(buttonid);
        buttonpip(alfsButtonPa);
} else {}}}
// Assign the pip button detection
var container1 = document.getElementById('urlbar-container');
var container2 = document.getElementById('pageActionPanelMainView');
container1.addEventListener('click', function(e){(reply_click());});
container2.addEventListener('click', function(e){(reply_click());});
function reply_click(e) {
    thework(e, 'image', 'pageAction-urlbar-alfs-b_thepante_github_io');
    thework(e, 'toolbarbutton', 'pageAction-panel-alfs-b_thepante_github_io');
}
