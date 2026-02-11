import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WhiteboardPlugins } from '../js/plugins.js';

describe('WhiteboardPlugins', () => {
    beforeEach(() => {
        // Reset static state between tests
        WhiteboardPlugins.elementTypes.clear();
        WhiteboardPlugins.panels.length = 0;
        WhiteboardPlugins.tools.length = 0;
        WhiteboardPlugins.hooks = {};
    });

    describe('static members', () => {
        test('elementTypes is a Map', () => {
            assert.ok(WhiteboardPlugins.elementTypes instanceof Map);
        });

        test('panels is an Array', () => {
            assert.ok(Array.isArray(WhiteboardPlugins.panels));
        });

        test('tools is an Array', () => {
            assert.ok(Array.isArray(WhiteboardPlugins.tools));
        });

        test('hooks is an Object', () => {
            assert.equal(typeof WhiteboardPlugins.hooks, 'object');
            assert.ok(!Array.isArray(WhiteboardPlugins.hooks));
        });
    });

    describe('registerElementType()', () => {
        test('registers a single element type', () => {
            const typeDef = {
                render: () => {},
                hitTest: () => false,
                defaults: { width: 100, height: 80 },
            };
            WhiteboardPlugins.registerElementType('ug-stand', typeDef);
            assert.equal(WhiteboardPlugins.elementTypes.size, 1);
            assert.deepEqual(WhiteboardPlugins.elementTypes.get('ug-stand'), typeDef);
        });

        test('registers multiple element types', () => {
            WhiteboardPlugins.registerElementType('ug-hal', { render: () => {}, hitTest: () => false, defaults: {} });
            WhiteboardPlugins.registerElementType('ug-stand', { render: () => {}, hitTest: () => false, defaults: {} });
            assert.equal(WhiteboardPlugins.elementTypes.size, 2);
        });
    });

    describe('getElementType()', () => {
        test('returns registered element type', () => {
            const typeDef = { render: () => {}, hitTest: () => false, defaults: {} };
            WhiteboardPlugins.registerElementType('ug-hal', typeDef);
            assert.deepEqual(WhiteboardPlugins.getElementType('ug-hal'), typeDef);
        });

        test('returns undefined for unknown type', () => {
            assert.equal(WhiteboardPlugins.getElementType('nonexistent'), undefined);
        });
    });

    describe('registerPanel()', () => {
        test('adds panel to panels array', () => {
            const panel = { title: 'Udstillerguide', render: () => {} };
            WhiteboardPlugins.registerPanel(panel);
            assert.equal(WhiteboardPlugins.panels.length, 1);
            assert.deepEqual(WhiteboardPlugins.panels[0], panel);
        });
    });

    describe('registerTools()', () => {
        test('adds tools to tools array', () => {
            const tools = [
                { id: 'ug-import', icon: 'import', label: 'Importer messe', action: () => {} },
                { id: 'ug-sync', icon: 'sync', label: 'Synkroniser', action: () => {} },
            ];
            WhiteboardPlugins.registerTools(tools);
            assert.equal(WhiteboardPlugins.tools.length, 2);
            assert.equal(WhiteboardPlugins.tools[0].id, 'ug-import');
            assert.equal(WhiteboardPlugins.tools[1].id, 'ug-sync');
        });
    });

    describe('fireHook()', () => {
        test('calls registered hook callbacks', () => {
            let called = false;
            WhiteboardPlugins.hooks.onElementCreate = [(el) => { called = true; }];
            WhiteboardPlugins.fireHook('onElementCreate', { id: 'test' });
            assert.equal(called, true);
        });

        test('passes arguments to hook callbacks', () => {
            let received = null;
            WhiteboardPlugins.hooks.onElementUpdate = [(el) => { received = el; }];
            const element = { id: 'el_1', type: 'rect' };
            WhiteboardPlugins.fireHook('onElementUpdate', element);
            assert.deepEqual(received, element);
        });

        test('does nothing for unregistered hooks', () => {
            // Should not throw
            WhiteboardPlugins.fireHook('onSomethingRandom', {});
        });

        test('calls multiple callbacks for same hook', () => {
            let count = 0;
            WhiteboardPlugins.hooks.onElementDelete = [() => count++, () => count++];
            WhiteboardPlugins.fireHook('onElementDelete', { id: 'test' });
            assert.equal(count, 2);
        });
    });

    describe('register()', () => {
        test('registers a complete plugin with element types, panel, tools, and hooks', () => {
            const onUpdate = (el) => {};
            const onLoad = (board) => {};

            WhiteboardPlugins.register('udstillerguide', {
                elementTypes: {
                    'ug-hal': { render: () => {}, hitTest: () => false, defaults: { width: 600 } },
                    'ug-stand': { render: () => {}, hitTest: () => false, defaults: { width: 120 } },
                },
                panel: {
                    title: 'Udstillerguide',
                    render: () => {},
                },
                tools: [
                    { id: 'ug-import', icon: 'import', label: 'Importer', action: () => {} },
                ],
                onElementUpdate: onUpdate,
                onBoardLoad: onLoad,
            });

            // Element types registered
            assert.equal(WhiteboardPlugins.elementTypes.size, 2);
            assert.ok(WhiteboardPlugins.elementTypes.has('ug-hal'));
            assert.ok(WhiteboardPlugins.elementTypes.has('ug-stand'));

            // Panel registered
            assert.equal(WhiteboardPlugins.panels.length, 1);
            assert.equal(WhiteboardPlugins.panels[0].title, 'Udstillerguide');

            // Tools registered
            assert.equal(WhiteboardPlugins.tools.length, 1);
            assert.equal(WhiteboardPlugins.tools[0].id, 'ug-import');

            // Hooks registered
            assert.ok(WhiteboardPlugins.hooks.onElementUpdate);
            assert.equal(WhiteboardPlugins.hooks.onElementUpdate.length, 1);
            assert.ok(WhiteboardPlugins.hooks.onBoardLoad);
            assert.equal(WhiteboardPlugins.hooks.onBoardLoad.length, 1);
        });

        test('handles plugin with only element types', () => {
            WhiteboardPlugins.register('minimal', {
                elementTypes: {
                    'custom-box': { render: () => {}, hitTest: () => false, defaults: {} },
                },
            });
            assert.equal(WhiteboardPlugins.elementTypes.size, 1);
            assert.equal(WhiteboardPlugins.panels.length, 0);
            assert.equal(WhiteboardPlugins.tools.length, 0);
        });

        test('multiple plugins accumulate registrations', () => {
            WhiteboardPlugins.register('plugin-a', {
                elementTypes: { 'type-a': { render: () => {}, hitTest: () => false, defaults: {} } },
                tools: [{ id: 'tool-a', action: () => {} }],
            });
            WhiteboardPlugins.register('plugin-b', {
                elementTypes: { 'type-b': { render: () => {}, hitTest: () => false, defaults: {} } },
                tools: [{ id: 'tool-b', action: () => {} }],
            });

            assert.equal(WhiteboardPlugins.elementTypes.size, 2);
            assert.equal(WhiteboardPlugins.tools.length, 2);
        });
    });
});
