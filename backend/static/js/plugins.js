// Plugin Registry - central registry for element types, sidebar panels, toolbar tools, and lifecycle hooks

export class WhiteboardPlugins {
    static elementTypes = new Map();
    static panels = [];
    static tools = [];
    static hooks = {};

    static registerElementType(name, typeDef) {
        this.elementTypes.set(name, typeDef);
    }

    static getElementType(name) {
        return this.elementTypes.get(name);
    }

    static registerPanel(panel) {
        this.panels.push(panel);
    }

    static registerTools(tools) {
        this.tools.push(...tools);
    }

    static fireHook(hookName, ...args) {
        const callbacks = this.hooks[hookName];
        if (!callbacks) return;
        for (const cb of callbacks) {
            cb(...args);
        }
    }

    static register(name, plugin) {
        if (plugin.elementTypes) {
            for (const [typeName, typeDef] of Object.entries(plugin.elementTypes)) {
                this.registerElementType(typeName, typeDef);
            }
        }

        if (plugin.panel) {
            this.registerPanel(plugin.panel);
        }

        if (plugin.tools) {
            this.registerTools(plugin.tools);
        }

        // Register lifecycle hooks (any property starting with "on")
        for (const key of Object.keys(plugin)) {
            if (key.startsWith('on') && typeof plugin[key] === 'function') {
                if (!this.hooks[key]) {
                    this.hooks[key] = [];
                }
                this.hooks[key].push(plugin[key]);
            }
        }
    }
}
