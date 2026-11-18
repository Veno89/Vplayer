import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowToolbar, WindowToolButton } from './WindowToolbar';

afterEach(cleanup);
describe('Window tool hints', () => {
  it('shows hover and keyboard hints outside clipping containers, and dismisses with Escape', () => {
    const view = render(
      <div style={{ overflow: 'hidden' }}>
        <WindowToolbar label="Tools">
          <WindowToolButton
            label="Locate"
            tooltip="Jump to the currently playing track."
          >
            Icon
          </WindowToolButton>
        </WindowToolbar>
      </div>
    );
    const button = screen.getByRole('button', { name: 'Locate' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(button.parentElement!);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Jump to the currently playing track.');
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);
    expect(view.container).not.toContainElement(tooltip);
    fireEvent.mouseLeave(button.parentElement!);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('explains disabled tools when the wrapper is hovered', () => {
    render(
      <WindowToolButton
        label="Locate"
        tooltip="Choose a song to play first."
        disabled
      >
        Icon
      </WindowToolButton>
    );
    const button = screen.getByRole('button', { name: 'Locate' });
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Choose a song to play first.'
    );
    expect(button).toBeDisabled();
  });
});
