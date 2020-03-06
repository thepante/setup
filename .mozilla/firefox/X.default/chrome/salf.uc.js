// ==UserScript==
// @name           salf.uc.js
// @include        main
// @version        2.0
// @note           u/thepante
// ==/UserScript==

var visualFeedback = false; // 'true' to check if it is being loaded correctly

var salf = document.getElementById("sidebar-box");
var browser = document.getElementById("browser");
var splitter = document.getElementById("sidebar-splitter");
var sbCloseButton = document.getElementById("sidebar-close");
var salfClass = salf.className;
var splitterClass = splitter.className;

// Add base rule //
var style = document.createElement('style');
style.innerHTML = `.closeit {display: none;}`;
document.head.appendChild(style);

// Start values //
sbVisible=false;
salf.checked=true;
salf.hidden=true;
salf.className = salfClass + ' closeit';
splitter.className = splitterClass + ' closeit';

// Declaring styles - only classic ATM //
var styleFloat = {
  '#sidebar-box': 'position: absolute !important; max-height: 60vh !important;-moz-box-ordinal-group: 4;', 
//  '.browserStack': 'position: absolute !important; width: 100vw; height: 100vw;',
  '#appcontent': '-moz-box-ordinal-group: 2;display: inline-flex;position: absolute;height: 94% !important;',
  '#tabbrowser-tabbox': 'width: 100vw !important;',
};

var styleClassic = {
  // doesn't require
};


// Style switcher //
var styled = styleClassic;
Object.entries(styled).forEach(([key, value]) => {
   var ident = document.querySelector(key);
   ident.setAttribute("style", value);
});

// Visual reference that js is loaded //
if (visualFeedback == true) {
  browser.setAttribute("style", "border-top: 2px solid brown;");
}

// Button functionality //
function buttonBehavior() {
  if (sbVisible == false) {
        sbIconButton.checked=true;
        salf.className = salfClass + ' openit';
        splitter.className = splitterClass;
        salf.checked=true;
        salf.hidden=false;
        sbVisible = true;
        console.log("salf - sb opened");
        if (visualFeedback == true) {browser.setAttribute("style", "border-top: 2px solid green;");}
    }
    else {
        sbIconButton.checked=false;
        salf.className = salfClass + ' closeit';
        splitter.className = splitterClass + ' closeit';
        salf.checked=true;
        salf.hidden=true;
        sbVisible = false;
        console.log("salf - sb closed");
        if (visualFeedback == true) {browser.setAttribute("style", "border-top: 2px solid violet;");}
    }
}

// Delayed to avoid getting button as null (?), then apply //
setTimeout(function() {iconbtn();}, 500);
function iconbtn() {
  sbIconButton = document.getElementById("sidebar-button");
  sbIconButton.checked=false;

  if (visualFeedback == true) {  // check its working
    sbIconButton.setAttribute("style", "border:1px solid yellow !important;");
  }

  sbIconButton.addEventListener('click', function(e){ // Toolbar button
      e.preventDefault();
      buttonBehavior();
      //e.stopPropagation();
  });

  sbCloseButton.addEventListener('click', function(e){ // Close (X) button
      e.preventDefault();
      buttonBehavior();
      //e.stopPropagation();
  });
}

console.log("salf - load ok");
