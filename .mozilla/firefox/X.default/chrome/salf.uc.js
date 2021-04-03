// ==UserScript==
// @name           salf.uc.js
// @include        main
// @version        2.5
// @note           u/thepante
// ==/UserScript==

// Settings
const hide_sidebar_header = false;
const debug_mode = false;

/* - - - - - - - - - - - - - -  */

const browser = document.getElementById("browser");
const sidebarBox = document.getElementById("sidebar-box");
const sidebarSplitter = document.getElementById("sidebar-splitter");
const sidebarBtnClose = document.getElementById("sidebar-close");
const sidebarHeader = document.getElementById("sidebar-header");

let sidebarButton;
let isSidebarOpen = false;
hideSidebar();

function showSidebar() {
  sidebarBox.style.display = 'inherit';
  sidebarSplitter.style.display = 'inherit';
  isSidebarOpen = true;
  sidebarBox.hidden = false;
  sidebarButton.checked = true;

  if (debug_mode) {
    console.log('sidebar → opened');
    browser.style.borderTopColor = 'green';
  };
}

function hideSidebar() {
  sidebarBox.style.display = 'none';
  sidebarSplitter.style.display = 'none';
  isSidebarOpen = false;
  sidebarBox.hidden = true;

  // under IF because the first call at L17, sidebarButton is still undefined
  if (sidebarButton) sidebarButton.checked = false;

  if (debug_mode) {
    console.log('sidebar → closed');
    browser.style.borderTopColor = 'violet';
  };
}

// Button functionality
const buttonBehavior = () => isSidebarOpen ? hideSidebar() : showSidebar();

window.addEventListener('load', function() {
  sidebarButton = document.getElementById('sidebar-button');

  if (hide_sidebar_header) sidebarHeader.style.display = 'none';

  // it's not fancy, but this fixes 2 bugs: button appears as checked when shouldn't (at start).
  // that could be fixed changing the previous window listener, but can't! has to be 'load' because
  // if not, that would introduce another bug: autocloses when changing sidebar (content) panel!
  window.addEventListener('DOMContentLoaded', function() {
    if (!isSidebarOpen) sidebarButton.checked = false;
  });

  // replace buttons behavior
  [sidebarButton, sidebarBtnClose].forEach(e => e.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    buttonBehavior();
  }));

  if (debug_mode) sidebarButton.style.border = '1px solid yellow';
});

// visual reference that the script just loaded
if (debug_mode) browser.style.borderTop = '2px solid brown';

console.log('salf → loaded ok');
