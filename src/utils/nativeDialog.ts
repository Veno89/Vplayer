/**
 * Native dialog wrappers using @tauri-apps/plugin-dialog.
 * Replaces browser confirm() and alert() with proper native Tauri dialogs.
 *
 * These are async (unlike browser confirm/alert) so callers must await them.
 */
import { ask, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Show a native confirmation dialog (Yes/No).
 * Returns true if the user clicked "Yes".
 * Passing the current window as parent ensures the dialog appears in front
 * of the app window on Windows (otherwise it can appear behind).
 */
export async function nativeConfirm(
  msg: string,
  title = 'VPlayer',
): Promise<boolean> {
  return ask(msg, { title, kind: 'warning', parent: getCurrentWindow() });
}

/**
 * Show a native info/success message dialog.
 */
export async function nativeAlert(
  msg: string,
  title = 'VPlayer',
): Promise<void> {
  await message(msg, { title, kind: 'info', parent: getCurrentWindow() });
}

/**
 * Show a native error message dialog.
 */
export async function nativeError(
  msg: string,
  title = 'Error',
): Promise<void> {
  await message(msg, { title, kind: 'error', parent: getCurrentWindow() });
}
