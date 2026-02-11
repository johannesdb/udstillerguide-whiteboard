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
        const stack = document.getElementById('wa-toast-stack');
        if (!stack) {
            // Fallback if wa-toast-stack not yet in DOM
            console.error(`[ErrorHandler] ${entry.error_type}: ${entry.message}`);
            return;
        }

        const variant = entry.severity === 'critical' ? 'danger' : 'warning';
        const alert = document.createElement('wa-alert');
        alert.variant = variant;
        alert.closable = true;
        alert.duration = 5000;
        alert.style.pointerEvents = 'auto';

        const icon = document.createElement('wa-icon');
        icon.slot = 'icon';
        icon.name = entry.severity === 'critical' ? 'circle-exclamation' : 'triangle-exclamation';
        icon.variant = 'solid';
        alert.appendChild(icon);

        const strong = document.createElement('strong');
        strong.textContent = entry.error_type;
        alert.appendChild(strong);
        alert.appendChild(document.createTextNode(': ' + entry.message.substring(0, 100)));

        alert.addEventListener('wa-after-hide', () => alert.remove());

        stack.appendChild(alert);
        requestAnimationFrame(() => {
            alert.toast();
        });
    }
}

// Singleton
export const errorHandler = new ErrorHandler();
