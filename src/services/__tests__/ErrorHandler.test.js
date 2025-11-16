import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorHandler } from '../ErrorHandler';

describe('ErrorHandler', () => {
  let mockToast;
  let errorHandler;

  beforeEach(() => {
    mockToast = {
      showError: vi.fn(),
      showWarning: vi.fn(),
      showSuccess: vi.fn(),
    };
    errorHandler = new ErrorHandler(mockToast);
  });

  describe('getUserMessage', () => {
    it('should return user-friendly message for ENOENT', () => {
      const error = { code: 'ENOENT', message: 'File not found' };
      const message = errorHandler.getUserMessage(error);
      expect(message).toContain('File not found');
      expect(message).toContain('moved or deleted');
    });

    it('should return user-friendly message for audio errors', () => {
      const error = new Error('Audio system unavailable');
      const message = errorHandler.getUserMessage(error);
      expect(message).toContain('Audio system is not available');
    });

    it('should return user-friendly message for database errors', () => {
      const error = new Error('Database query failed');
      const message = errorHandler.getUserMessage(error);
      expect(message).toContain('Database error');
    });

    it('should return generic message for unknown errors', () => {
      const error = new Error('Some random error');
      const message = errorHandler.getUserMessage(error);
      expect(message).toContain('An error occurred');
    });

    it('should truncate very long error messages', () => {
      const longError = new Error('A'.repeat(200));
      const message = errorHandler.getUserMessage(longError);
      expect(message).toContain('unexpected error');
      expect(message.length).toBeLessThan(150);
    });
  });

  describe('isCritical', () => {
    it('should identify audio system errors as critical', () => {
      const error = new Error('Audio system unavailable');
      expect(errorHandler.isCritical(error)).toBe(true);
    });

    it('should identify database errors as critical', () => {
      const error = new Error('Database connection failed');
      expect(errorHandler.isCritical(error)).toBe(true);
    });

    it('should not identify file not found as critical', () => {
      const error = new Error('File not found');
      expect(errorHandler.isCritical(error)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should show error toast for critical errors', () => {
      const error = new Error('Fatal: Database crashed');
      errorHandler.handle(error, 'Test');
      expect(mockToast.showError).toHaveBeenCalled();
      expect(mockToast.showWarning).not.toHaveBeenCalled();
    });

    it('should show warning toast for non-critical errors', () => {
      const error = new Error('File not found');
      errorHandler.handle(error, 'Test');
      expect(mockToast.showWarning).toHaveBeenCalled();
      expect(mockToast.showError).not.toHaveBeenCalled();
    });

    it('should log error to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');
      errorHandler.handle(error, 'Test Context');
      expect(consoleSpy).toHaveBeenCalledWith('[Test Context]', error);
      consoleSpy.mockRestore();
    });
  });

  describe('logOnly', () => {
    it('should only log without showing toast', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new Error('Test warning');
      errorHandler.logOnly(error, 'Test');
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(mockToast.showError).not.toHaveBeenCalled();
      expect(mockToast.showWarning).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });
});
