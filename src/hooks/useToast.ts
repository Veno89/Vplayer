import { create } from 'zustand';
import { useStore } from '../store/useStore';

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  duration: number;
}

export interface ToastAPI {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], duration?: number) => number;
  removeToast: (id: number) => void;
  showSuccess: (message: string, duration?: number) => number;
  showError: (message: string, duration?: number) => number;
  showWarning: (message: string, duration?: number) => number;
  showInfo: (message: string, duration?: number) => number;
}

let _toastId = 0;

/**
 * Check the showNotifications setting from the main store.
 */
function areNotificationsEnabled(): boolean {
  try {
    return useStore.getState().showNotifications ?? true;
  } catch {
    return true; // default to showing if store isn't ready
  }
}

/**
 * Global toast store — singleton.
 * Every call to useToast() returns the SAME store, so toasts from any
 * component or hook all appear in the single <ToastContainer>.
 */
const useToastStore = create<ToastAPI>((set, get) => {
  const removeToast = (id: number) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  };

  const addToast = (message: string, type: Toast['type'] = 'info', duration: number = 5000): number => {
    // Always show errors regardless of notification setting
    if (type !== 'error' && !areNotificationsEnabled()) {
      return -1;
    }

    const id = ++_toastId;
    const newToast: Toast = { id, message, type, duration };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  };

  return {
    toasts: [],
    addToast,
    removeToast,
    showSuccess: (message, duration?) => addToast(message, 'success', duration),
    showError: (message, duration?) => addToast(message, 'error', duration),
    showWarning: (message, duration?) => addToast(message, 'warning', duration),
    showInfo: (message, duration?) => addToast(message, 'info', duration),
  };
});

/**
 * Hook returning the global toast API.
 * Safe to call from any component or hook — all toasts go to the same store.
 */
export function useToast(): ToastAPI {
  return useToastStore();
}