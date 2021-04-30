// ==UserScript==
// @name           salf.uc.js
// @include        main
// @version        3.0
// @note           github.com/thepante
// ==/UserScript==

/* - - - - - - - - - - -  SETTINGS  - - - - - - - - - - - - - - - */

const float_mode = {
  enabled: true,
  config: {
    width: '280px',
    height: '100%',
    position: 'right',
    shadow_intst: 0.12,
    transparent: false,
    // -- slide settings
    slide: true,
    fade: true,
    speed: 0.1,
  }
};

const shortcut = {
  enabled: true,
  modifier: 'ctrl',
  key: 'e',
  auto_close: true,
}

const hide_sidebar_header = false;


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */

const sidebar = document.getElementById('sidebar');
const sidebarBox = document.getElementById('sidebar-box');
const sidebarBtnClose = document.getElementById('sidebar-close');
const sidebarHeader = document.getElementById('sidebar-header');

let sidebarButton;
let isSidebarOpen = false;

const style_classic = `
  #sidebar-box { display: inherit; }
  #sidebar-box + #sidebar-splitter { display: inherit; }
  #sidebar-box.hide { display: none; }
  #sidebar-box.hide + #sidebar-splitter { display: none; }
`;

const style_float = () => `
  #sidebar-splitter { display: none; }
  #sidebar-header { width: 100% !important; }
  ${ float_mode.config.height != '100%' ? `
    #sidebar-box, #sidebar-box #sidebar {
      border-bottom-${float_mode.config.position == 'right' ? 'left' : 'right'}-radius: 4px;
    }
  ` : ''}
  #sidebar-box {
    --sidebar-width: ${float_mode.config.width};
    --sidebar-height: calc(${float_mode.config.height} - ${window.innerHeight - browser.clientHeight}px);
    transition: all ${float_mode.config.speed}s ease-in-out;
    position: absolute;
    display: block;
    float: right;
    ${float_mode.config.position}: 0;
    width: var(--sidebar-width) !important;
    height: var(--sidebar-height) !important;
    box-shadow: rgba(0, 0, 0, ${float_mode.config.shadow_intst}) 5px 15px 60px 42px;
    z-index: 100;
    ${ float_mode.config.transparent
      ? `opacity: .8;
         backdrop-filter: blur(12px);`
      : 'opacity: 1;'
    }
  }
  #sidebar-box #sidebar {
    display: block;
    width: 100% !important;
    max-width: 100% !important;
    height: calc(100% ${!hide_sidebar_header ? `- 42px` : ''}) !important;
  }
  #sidebar-box.hide {
    box-shadow: none;
    ${ float_mode.config.slide
      ? `${float_mode.config.position}: calc(var(--sidebar-width) * -1);`
      : 'display: none;'
    }
    ${ float_mode.config.fade &&
      'opacity: 0;'
    }
  }
`;

// // Append stylesheet to the browser document
// // In a function to call later on. Thats because the float stylesheet is
// // also in a func to call and define when info about top offset is correct
// function setStylesheet() {
//   try {
//     const s = document.createElement('style');
//     s.setAttribute('type', 'text/css');
//     s.setAttribute('id', 'salf');
//     s.appendChild(document.createTextNode(
//       float_mode.enabled ? style_float() : style_classic
//     ));
//     document.head.appendChild(s);
//   } catch (error) {
//     console.debug(error);
//   }
// }

function setStylesheet() {
  const salfCSS = document.getElementById('salf');
  const css = float_mode.enabled ? style_float() : style_classic;
  try {
    if (!salfCSS) {
      const s = document.createElement('style');
      s.setAttribute('type', 'text/css');
      s.setAttribute('id', 'salf');
      s.appendChild(document.createTextNode(css));
      document.head.appendChild(s);
    } else {
      salfCSS.innerHTML = css;
    }
  } catch (error) {
    console.debug(error);
  }
}

function showSidebar() {
  isSidebarOpen = true;
  sidebarBox.hidden = false;
  sidebarButton.checked = true;
  sidebarBox.classList.remove('hide');
}

function hideSidebar() {
  isSidebarOpen = false;
  sidebarBox.hidden = true;
  sidebarButton.checked = false;
  sidebarBox.classList.add('hide');
}

// Button functionality
const buttonBehavior = () => isSidebarOpen ? hideSidebar() : showSidebar();

window.addEventListener('load', function() {
  sidebarButton = document.getElementById('sidebar-button');

  if (hide_sidebar_header) sidebarHeader.style.display = 'none';

  // it's not fancy, but this fixes 2 bugs: button appears as checked when
  // shouldn't (at start). that could be fixed changing the previous window
  // listener, but can't! has to be 'load' because if not, that would introduce
  // another bug: autocloses when changing sidebar (content) panel!
  window.addEventListener('DOMContentLoaded', function() {
    if (!isSidebarOpen) sidebarButton.checked = false;
  });

  setStylesheet();
  hideSidebar();

  // replace buttons vanilla behavior
  [sidebarButton, sidebarBtnClose].forEach(
    e => e.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      buttonBehavior();
    })
  );
});

// Shortcut functionality
if (shortcut.enabled) {
  document.onkeydown = function(e) {
    if (e[shortcut.modifier + 'Key'] && e.key.toLowerCase() === shortcut.key.toLowerCase()) {
      e.preventDefault();
      e.stopPropagation();
      buttonBehavior();
    }
  };

  // auto hide sidebar when modifier + click inside its content
  if (shortcut.auto_close) {
    sidebar.onclick = function(e) {
      if (e[shortcut.modifier + 'Key']) hideSidebar();
    }
  }
}



/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
// For change settings and test without restart firefox needed
// Options aren't save because it doesn't rewrite the file
function testSettings(obj) {
  Object.entries(obj).forEach(([k, v]) => float_mode.config[k] = v);
  if (obj.enabled != undefined) float_mode.enabled = Boolean(obj.enabled);
  if (obj.header != undefined) {
    hide_sidebar_header = !Boolean(obj.header);
    sidebarHeader.style.display = obj.header ? 'revert' : 'none';
  }
  setStylesheet();
}

console.log('salf → loaded ok');

