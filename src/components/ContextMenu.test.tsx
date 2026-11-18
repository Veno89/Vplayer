import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

afterEach(cleanup);
describe('Context menu dismissal', () => {
  it.each(['mouseDown', 'pointerDown'] as const)(
    'dismisses on %s outside even when a window stops bubbling',
    (event) => {
      const close = vi.fn();
      render(
        <div
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button>Other window content</button>
          <ContextMenu
            x={10}
            y={10}
            items={[{ label: 'Rename', onClick: vi.fn() }]}
            onClose={close}
          />
        </div>
      );
      fireEvent[event](
        screen.getByRole('button', { name: 'Other window content' })
      );
      expect(close).toHaveBeenCalledOnce();
    }
  );
  it('keeps internal interactions open until an action is selected and supports Escape', () => {
    const close = vi.fn(),
      action = vi.fn();
    render(
      <ContextMenu
        x={10}
        y={10}
        items={[{ label: 'Rename', onClick: action }]}
        onClose={close}
      />
    );
    const item = screen.getByRole('menuitem', { name: 'Rename' });
    fireEvent.pointerDown(item);
    fireEvent.mouseDown(item);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(item);
    expect(action).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    close.mockClear();
    fireEvent.keyDown(item, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
});
