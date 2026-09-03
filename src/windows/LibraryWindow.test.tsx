/// <reference types="vitest/globals" />
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LibraryMaintenanceActions } from './LibraryWindow';

const createProps = () => ({
  addingFolder: false,
  checkingMissing: false,
  missingProgress: null,
  removingDuplicates: false,
  repairingLibrary: false,
  isScanning: false,
  scanProgress: 0,
  orphanTracks: 8_853,
  onAddFolder: vi.fn(),
  onCheckMissing: vi.fn(),
  onRemoveDuplicates: vi.fn(),
  onRepairLibrary: vi.fn(),
});

describe('LibraryMaintenanceActions', () => {
  it('renders compact icon controls with accessible names and tooltips', () => {
    const props = createProps();
    render(<LibraryMaintenanceActions {...props} />);

    const addFolder = screen.getByRole('button', { name: 'Add music folder' });
    const checkMissing = screen.getByRole('button', { name: 'Check for missing files' });
    const removeDuplicates = screen.getByRole('button', { name: 'Remove duplicate library entries' });
    const repair = screen.getByRole('button', { name: 'Repair 8853 orphaned library records' });

    for (const button of [addFolder, checkMissing, removeDuplicates, repair]) {
      expect(button).toHaveClass('h-8', 'w-8');
      expect(button).toHaveAttribute('title');
    }

    fireEvent.click(addFolder);
    fireEvent.click(checkMissing);
    fireEvent.click(removeDuplicates);
    fireEvent.click(repair);
    expect(props.onAddFolder).toHaveBeenCalledOnce();
    expect(props.onCheckMissing).toHaveBeenCalledOnce();
    expect(props.onRemoveDuplicates).toHaveBeenCalledOnce();
    expect(props.onRepairLibrary).toHaveBeenCalledOnce();
  });

  it('shows progress visibly and disables competing maintenance actions', () => {
    const props = createProps();
    render(
      <LibraryMaintenanceActions
        {...props}
        checkingMissing
        missingProgress={{ checked: 500, total: 1_500 }}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Checking missing files: 500 / 1500');
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('does not offer repair when the registered-library scope is clean', () => {
    render(<LibraryMaintenanceActions {...createProps()} orphanTracks={0} />);
    expect(screen.queryByRole('button', { name: /orphaned library records/i })).not.toBeInTheDocument();
  });
});
