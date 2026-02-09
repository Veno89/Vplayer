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
    // Settings button has aria-label="Open Settings"
    const settingsBtn = screen.getByRole('button', { name: /open settings/i });
    expect(settingsBtn).toBeInTheDocument();
    // click should not throw and should keep app rendered
    fireEvent.click(settingsBtn);
    // Wait for the options modal to appear - look for Settings header and Appearance tab (default)
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });
});
