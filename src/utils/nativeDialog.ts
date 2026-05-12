/**
 * Native dialog wrappers using @tauri-apps/plugin-dialog.
 * Replaces browser confirm() and alert() with proper native Tauri dialogs.
 *
 * These are async (unlike browser confirm/alert) so callers must await them.
 */
import { ask, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

type DialogOptionsWithParent = {
  title: string;
  kind: 'info' | 'warning' | 'error';
  parent: ReturnType<typeof getCurrentWindow>;
};

function showFallbackConfirm(msg: string, title: string): Promise<boolean> {
  if (typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(2, 6, 23, 0.72)';
    overlay.style.backdropFilter = 'blur(4px)';

    const dialog = document.createElement('div');
    dialog.style.width = 'min(420px, calc(100vw - 32px))';
    dialog.style.border = '1px solid rgba(148, 163, 184, 0.28)';
    dialog.style.borderRadius = '12px';
    dialog.style.background = '#0f172a';
    dialog.style.boxShadow = '0 24px 80px rgba(0, 0, 0, 0.45)';
    dialog.style.color = '#f8fafc';
    dialog.style.padding = '18px';

    const heading = document.createElement('h2');
    heading.textContent = title;
    heading.style.margin = '0 0 10px';
    heading.style.fontSize = '16px';
    heading.style.fontWeight = '700';

    const body = document.createElement('p');
    body.textContent = msg;
    body.style.margin = '0';
    body.style.color = '#cbd5e1';
    body.style.fontSize = '14px';
    body.style.lineHeight = '1.45';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '18px';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.style.border = '1px solid rgba(148, 163, 184, 0.25)';
    cancelButton.style.borderRadius = '8px';
    cancelButton.style.background = '#1e293b';
    cancelButton.style.color = '#e2e8f0';
    cancelButton.style.padding = '8px 12px';
    cancelButton.style.cursor = 'pointer';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    const confirmTextSource = `${title} ${msg}`;
    confirmButton.textContent = /delete/i.test(confirmTextSource)
      ? 'Delete'
      : /remove/i.test(confirmTextSource)
        ? 'Remove'
        : /clear/i.test(confirmTextSource)
          ? 'Clear'
          : /reset/i.test(confirmTextSource)
            ? 'Reset'
            : 'OK';
    confirmButton.style.border = '1px solid rgba(248, 113, 113, 0.35)';
    confirmButton.style.borderRadius = '8px';
    confirmButton.style.background = '#b91c1c';
    confirmButton.style.color = '#fff';
    confirmButton.style.padding = '8px 12px';
    confirmButton.style.cursor = 'pointer';

    actions.append(cancelButton, confirmButton);
    dialog.append(heading, body, actions);
    overlay.append(dialog);

    const cleanup = (value: boolean) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cleanup(false);
      if (event.key === 'Enter') cleanup(true);
    };

    overlay.addEventListener('mousedown', event => {
      if (event.target === overlay) cleanup(false);
    });
    cancelButton.addEventListener('click', () => cleanup(false));
    confirmButton.addEventListener('click', () => cleanup(true));
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => confirmButton.focus());
  });
}

function showFallbackMessage(msg: string, title: string, kind: 'info' | 'error'): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(2, 6, 23, 0.72)';
    overlay.style.backdropFilter = 'blur(4px)';

    const dialog = document.createElement('div');
    dialog.style.width = 'min(420px, calc(100vw - 32px))';
    dialog.style.border = '1px solid rgba(148, 163, 184, 0.28)';
    dialog.style.borderRadius = '12px';
    dialog.style.background = '#0f172a';
    dialog.style.boxShadow = '0 24px 80px rgba(0, 0, 0, 0.45)';
    dialog.style.color = '#f8fafc';
    dialog.style.padding = '18px';

    const heading = document.createElement('h2');
    heading.textContent = title;
    heading.style.margin = '0 0 10px';
    heading.style.fontSize = '16px';
    heading.style.fontWeight = '700';
    heading.style.color = kind === 'error' ? '#fca5a5' : '#f8fafc';

    const body = document.createElement('p');
    body.textContent = msg;
    body.style.margin = '0';
    body.style.color = '#cbd5e1';
    body.style.fontSize = '14px';
    body.style.lineHeight = '1.45';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.marginTop = '18px';

    const okButton = document.createElement('button');
    okButton.type = 'button';
    okButton.textContent = 'OK';
    okButton.style.border = '1px solid rgba(56, 189, 248, 0.35)';
    okButton.style.borderRadius = '8px';
    okButton.style.background = '#0369a1';
    okButton.style.color = '#fff';
    okButton.style.padding = '8px 12px';
    okButton.style.cursor = 'pointer';

    actions.append(okButton);
    dialog.append(heading, body, actions);
    overlay.append(dialog);

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') cleanup();
    };

    overlay.addEventListener('mousedown', event => {
      if (event.target === overlay) cleanup();
    });
    okButton.addEventListener('click', cleanup);
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => okButton.focus());
  });
}

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
  try {
    return await ask(msg, { title, kind: 'warning', parent: getCurrentWindow() } as DialogOptionsWithParent);
  } catch (err) {
    console.warn('Native confirmation dialog failed; falling back to in-app confirm.', err);
    return showFallbackConfirm(msg, title);
  }
}

/**
 * Show a native info/success message dialog.
 */
export async function nativeAlert(
  msg: string,
  title = 'VPlayer',
): Promise<void> {
  try {
    await message(msg, { title, kind: 'info', parent: getCurrentWindow() } as DialogOptionsWithParent);
  } catch (err) {
    console.warn('Native alert dialog failed; falling back to in-app message.', err);
    await showFallbackMessage(msg, title, 'info');
  }
}

/**
 * Show a native error message dialog.
 */
export async function nativeError(
  msg: string,
  title = 'Error',
): Promise<void> {
  try {
    await message(msg, { title, kind: 'error', parent: getCurrentWindow() } as DialogOptionsWithParent);
  } catch (err) {
    console.warn('Native error dialog failed; falling back to in-app message.', err);
    await showFallbackMessage(msg, title, 'error');
  }
}
