import { ToastService } from '../types';

/**
 * Centralized error handling service
 * Provides consistent error handling across the application
 */
export class ErrorHandler {
    private toast: ToastService;

    constructor(toast: ToastService) {
        this.toast = toast;
    }

    /**
     * Handle an error with appropriate user feedback
     * @param {Error|string} error - The error to handle
     * @param {string} context - Context where the error occurred (e.g., 'Audio Playback', 'Library')
     */
    handle(error: any, context: string = ''): void {
        // Log for debugging
        console.error(`[${context}]`, error);

        // Get user-friendly message
        const message = this.getUserMessage(error);

        // Classify severity and show appropriate toast
        if (this.isCritical(error)) {
            this.toast.showError(message);
        } else {
            this.toast.showWarning(message);
        }
    }

    /**
     * Get user-friendly error message
     * @param {Error|string} error - The error
     * @returns {string} User-friendly message
     */
    getUserMessage(error: any): string {
        const errorString = error?.message || error?.toString() || String(error);
        const errorCode = error?.code;

        // Map common error codes/patterns to user-friendly messages
        const errorMap: Record<string, string> = {
            'ENOENT': 'File not found. The file may have been moved or deleted.',
            'EACCES': 'Permission denied. Check file permissions.',
            'ENOTDIR': 'Invalid directory path.',
            'EISDIR': 'Expected a file, but found a directory.',
            'SQLITE_BUSY': 'Database is busy. Please try again in a moment.',
            'SQLITE_LOCKED': 'Database is locked. Please wait and try again.',
            'NetworkError': 'Network error. Please check your internet connection.',
            'TimeoutError': 'Operation timed out. Please try again.',
            'AbortError': 'Operation was cancelled.',
        };

        // Check for exact code match
        if (errorCode && errorMap[errorCode]) {
            return errorMap[errorCode];
        }

        // Check for pattern matches in error message
        const patterns: Record<string, string> = {
            'audio system unavailable': 'Audio system is not available. Please restart the application.',
            'failed to load track': 'Could not load the audio track. The file may be corrupted or unsupported.',
            'failed to decode': 'Could not decode audio file. Format may be unsupported.',
            'no output device': 'No audio output device found. Please check your audio settings.',
            'failed to open file': 'Could not open file. It may be in use by another program.',
            'database': 'Database error. Please restart the application.',
            'permission denied': 'Permission denied. Check file or folder permissions.',
            'not found': 'Resource not found.',
            'already exists': 'A resource with that name already exists.',
            'invalid': 'Invalid input or operation.',
        };

        // Check error message for patterns
        const lowerMessage = errorString.toLowerCase();
        for (const [pattern, friendlyMessage] of Object.entries(patterns)) {
            if (lowerMessage.includes(pattern.toLowerCase())) {
                return friendlyMessage;
            }
        }

        // Fallback to generic message with error hint
        if (errorString.length > 100) {
            return 'An unexpected error occurred. Please try again or check the console for details.';
        }

        return `An error occurred: ${errorString}`;
    }

    /**
     * Determine if error is critical (requires error toast vs warning)
     * @param {Error|string} error - The error
     * @returns {boolean} True if critical
     */
    isCritical(error: any): boolean {
        const errorString = error?.message || error?.toString() || String(error);
        const lowerMessage = errorString.toLowerCase();

        const criticalPatterns = [
            'audio system unavailable',
            'database',
            'sqlite',
            'failed to initialize',
            'cannot start',
            'fatal',
            'crashed',
        ];

        return criticalPatterns.some(pattern => lowerMessage.includes(pattern));
    }

    /**
     * Handle errors silently (log only, no toast)
     * @param {Error|string} error - The error
     * @param {string} context - Context where the error occurred
     */
    logOnly(error: any, context: string = ''): void {
        console.warn(`[${context}]`, error);
    }

    /**
     * Report error to tracking service (placeholder for future implementation)
     * @param {Error|string} error - The error
     * @param {string} context - Context where the error occurred
     */
    report(error: any, context: string = ''): void {
        // TODO: Implement error tracking integration (e.g., Sentry)
        // For now, just log it
        console.error(`[ERROR REPORT] [${context}]`, error);
    }
}

/**
 * React hook to use the ErrorHandler
 * @param {Object} toast - Toast notification service
 * @returns {ErrorHandler} Error handler instance
 */
export function useErrorHandler(toast: ToastService): ErrorHandler {
    // Create error handler instance with toast service
    return new ErrorHandler(toast);
}
