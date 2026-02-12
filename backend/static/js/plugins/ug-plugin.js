// UG Plugin - Main registration
// Registrerer element-typer, panel og tools for Udstillerguide

import { WhiteboardPlugins } from '/js/plugins.js?v=4';
import { UG_ELEMENT_TYPES } from './ug-elements.js?v=4';
import { importMesseData } from './ug-layout.js?v=4';
import { renderUgPanel } from './ug-panel.js?v=4';
import { syncUg } from './ug-api.js?v=4';

WhiteboardPlugins.register('udstillerguide', {
    elementTypes: UG_ELEMENT_TYPES,

    panel: {
        id: 'udstillerguide',
        title: 'Udstillerguide',
        render: (container) => {
            const app = window.__whiteboardApp;
            renderUgPanel(container, app);
        },
    },

    tools: [
        {
            name: 'ug-import',
            title: 'Synkroniser messe-data fra UG Core',
            icon: '<wa-icon name="arrows-rotate" variant="sharp" family="solid" style="font-size:18px"></wa-icon>',
            cursor: 'default',
            onDown: async (world, app) => {
                try {
                    const data = await syncUg(app.boardId);
                    if (data.haller) {
                        const count = importMesseData(app, data);
                        if (app.uiManager) {
                            app.uiManager.showToast(`${count} elementer importeret`, 'success');
                        }
                    } else {
                        if (app.uiManager) {
                            app.uiManager.showToast('Ingen UG-forbindelse. Brug panelet til at forbinde.', 'warning');
                        }
                    }
                } catch (error) {
                    console.error('UG import failed:', error);
                    if (app.uiManager) {
                        app.uiManager.showToast(`Import fejl: ${error.message}`, 'danger');
                    }
                }
            },
        },
    ],

    onElementUpdate: (id, props) => {
        // TODO: Queue changes for push to UG Core
    },

    onElementDelete: (id) => {
        // TODO: Handle deletion of synced elements
    },
});
