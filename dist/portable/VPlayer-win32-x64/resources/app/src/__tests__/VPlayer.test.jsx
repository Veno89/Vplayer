import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../App'

describe('VPlayer UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders main player and can open options', () => {
    render(<App />);
    // Settings button has aria-label="Open Settings"
    const settingsBtn = screen.getByRole('button', { name: /open settings/i });
    expect(settingsBtn).toBeInTheDocument();
    // click should not throw and should keep app rendered
    fireEvent.click(settingsBtn);
    expect(screen.getByText(/Window Visibility/i)).toBeInTheDocument();
  });
});
