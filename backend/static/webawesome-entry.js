// Entry point for esbuild bundling of Web Awesome Pro 3
// Bundle everything into a single file - no autoloading needed

// Core loader (registers autoloader, utilities, etc.)
import './node_modules/@awesome.me/webawesome-pro/dist/webawesome.loader.js';

// Import all components used in the whiteboard app
// wa-alert renamed to wa-callout in WA Pro 3
import './node_modules/@awesome.me/webawesome-pro/dist/components/callout/callout.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/avatar/avatar.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/badge/badge.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/button/button.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/color-picker/color-picker.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/dialog/dialog.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/divider/divider.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/drawer/drawer.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/dropdown/dropdown.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/dropdown-item/dropdown-item.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/icon/icon.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/input/input.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/option/option.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/popup/popup.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/select/select.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/slider/slider.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/spinner/spinner.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/tab/tab.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/tab-group/tab-group.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/tab-panel/tab-panel.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/tag/tag.js';
import './node_modules/@awesome.me/webawesome-pro/dist/components/tooltip/tooltip.js';
