/// <reference types="vitest/globals" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'

describe('VPlayer UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders main player and can open options', async () => {
    render(<App />);
    // The Player gear opens full settings directly, including before selecting music.
    const settingsBtn = await screen.findByRole(
      'button',
      { name: /open settings/i },
      { timeout: 5000 },
    );
    expect(settingsBtn).toBeInTheDocument();
    // click should not throw and should keep app rendered
    fireEvent.click(settingsBtn);
    expect(screen.queryByRole('dialog', { name: 'Playback tools' })).not.toBeInTheDocument();
    // Wait for the options modal to appear - look for Settings header and Appearance tab (default)
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
