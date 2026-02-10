/// <reference types="vitest/globals" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryContent } from './LibraryContent';

describe('LibraryContent', () => {
  it('renders empty state when no folders', () => {
    render(<LibraryContent libraryFolders={[]} tracksCount={0} isScanning={false} scanProgress={0} handleAddFolder={() => {}} handleRemoveFolder={() => {}} />);
    expect(screen.getByText(/No folders added yet/i)).toBeInTheDocument();
  });

  it('renders folders when provided', () => {
    const folders = [
      { id: '1', path: 'C:/Music', tracks: 10, status: 'Indexed', dateAdded: '2025-10-31' }
    ];
    render(<LibraryContent libraryFolders={folders} tracksCount={10} isScanning={false} scanProgress={0} handleAddFolder={() => {}} handleRemoveFolder={() => {}} />);
    expect(screen.getByText(/C:/i)).toBeInTheDocument();
    expect(screen.getByText(/10 tracks/i)).toBeInTheDocument();
  });
});
