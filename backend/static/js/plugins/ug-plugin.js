// UG Plugin - Hovedregistrering
// Samler element-typer, sidebar panel, toolbar tools og lifecycle hooks

import { WhiteboardPlugins } from '/js/plugins.js?v=4';
import { UG_ELEMENT_TYPES } from './ug-elements.js';
import { renderUgPanel } from './ug-panel.js';
import { importMesseData } from './ug-layout.js';

// Registrer UG-pluginet
WhiteboardPlugins.register('udstillerguide', {
    // Custom element-typer
    elementTypes: UG_ELEMENT_TYPES,

    // Sidebar-panel
    panel: {
        id: 'udstillerguide',
        title: 'Udstillerguide',
        render: (container) => {
            const app = window.__whiteboardApp;
            if (app) {
                renderUgPanel(container, app);
            } else {
                container.innerHTML = '<div style="padding:16px; color:var(--wa-color-neutral-500)">Whiteboard ikke klar...</div>';
            }
        },
    },

    // Toolbar-knapper
    tools: [
        {
            name: 'ug-import',
            title: 'Importer messe-data',
            icon: '<wa-icon name="file-import" family="sharp" variant="solid"></wa-icon>',
            cursor: 'default',
            onDown: (world, app) => {
                try {
                    const count = importMesseData(app);
                    if (app.uiManager) {
                        app.uiManager.showToast(`${count} messe-elementer importeret`, 'success');
                    }
                } catch (error) {
                    if (app.uiManager) {
                        app.uiManager.showToast('Fejl ved import af messe-data', 'danger');
                    }
                }
            },
        },
    ],

    // Lifecycle hooks
    onElementUpdate: (id, props) => {
        // Fremtidig: send aendringer til UG Core API
        // console.log('UG Plugin: element updated', id, props);
    },

    onElementDelete: (id) => {
        // Fremtidig: haandter sletning af UG-elementer
        // console.log('UG Plugin: element deleted', id);
    },
});

console.log('UG Plugin: registreret');
