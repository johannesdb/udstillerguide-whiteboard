// Error Handler - global error catching, reporting, and user notification

class ErrorHandler {
    constructor() {
        this.queue = [];
        this.sending = false;
        this.init();
    }

    init() {
        // Fang uventede fejl
        window.onerror = (message, source, lineno, colno, error) => {
            this.report({
                error_type: 'runtime',
                severity: 'error',
                message: `${message} at ${source}:${lineno}:${colno}`,
                stack_trace: error?.stack || null,
                context: { source, lineno, colno },
            });
        };

        // Fang unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.report({
                error_type: 'promise',
                severity: 'error',
                message: `Unhandled rejection: ${event.reason}`,
                stack_trace: event.reason?.stack || null,
                context: { reason: String(event.reason) },
            });
        });
    }

    /**
     * Async wrapper - brug til alle async operationer:
     * await errorHandler.wrap('render', async () => { ... });
     */
    async wrap(errorType, fn, context = {}) {
        try {
            return await fn();
        } catch (error) {
            this.report({
                error_type: errorType,
                severity: context.severity || 'error',
                message: error.message,
                stack_trace: error.stack,
                context: { ...context, functionName: fn.name || 'anonymous' },
            });
            throw error;
        }
    }

    /**
     * Sync wrapper til canvas/DOM operationer
     */
    wrapSync(errorType, fn, context = {}) {
        try {
            return fn();
        } catch (error) {
            this.report({
                error_type: errorType,
                severity: context.severity || 'error',
                message: error.message,
                stack_trace: error.stack,
                context: { ...context, functionName: fn.name || 'anonymous' },
            });
            throw error;
        }
    }

    report(entry) {
        entry.source = 'frontend';
        entry.url = window.location.href;
        entry.user_agent = navigator.userAgent;

        // Log lokalt altid
        console.error('[ErrorHandler]', entry.error_type, entry.message);

        // Vis toast til bruger
        this.showToast(entry);

        // Send til backend (batched)
        this.queue.push(entry);
        this.flush();
    }

    async flush() {
        if (this.sending || this.queue.length === 0) return;
        this.sending = true;

        const batch = this.queue.splice(0, 10);
        try {
            for (const entry of batch) {
                await fetch('/api/errors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entry),
                });
            }
        } catch (e) {
            // Fejl-reporting fejlede - log lokalt, tab ikke data
            console.error('[ErrorHandler] Failed to send errors to backend:', e);
            this.queue.unshift(...batch);
        }
        this.sending = false;

        // Fortsaet hvis der er mere i koeen
        if (this.queue.length > 0) {
            setTimeout(() => this.flush(), 1000);
        }
    }

    showToast(entry) {
        let container = document.getElementById('error-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'error-toast-container';
            container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const bg = entry.severity === 'critical' ? '#dc2626' : '#ef4444';
        toast.style.cssText = `
            background: ${bg}; color: white; padding: 12px 16px; border-radius: 8px;
            font-size: 14px; max-width: 350px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: pointer; opacity: 0; transition: opacity 0.3s ease;
        `;
        toast.textContent = `\u26A0 ${entry.error_type}: ${entry.message.substring(0, 100)}`;
        toast.onclick = () => toast.remove();
        container.appendChild(toast);

        // Fade in
        requestAnimationFrame(() => { toast.style.opacity = '1'; });

        // Auto-remove after 5s
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
}

// Singleton
export const errorHandler = new ErrorHandler();
