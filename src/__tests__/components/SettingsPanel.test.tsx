import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsPanel } from '../../components/settings/SettingsPanel';

vi.mock('../../components/settings/AISettings', () => ({
  AISettings: () => <div data-testid="ai-settings">AI Settings Content</div>,
}));

describe('SettingsPanel', () => {
  it('renders the settings title', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders all tab buttons', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const tabContainer = document.querySelector('.settings-tabs')!;
    expect(tabContainer).toHaveTextContent('AI');
    expect(tabContainer).toHaveTextContent('Editor');
    expect(tabContainer).toHaveTextContent('Agent');
    expect(tabContainer).toHaveTextContent('Theme');
    expect(tabContainer).toHaveTextContent('Extensions');
  });

  it('defaults to AI tab and renders AI settings', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByTestId('ai-settings')).toBeInTheDocument();
  });

  it('switches to Editor tab on click', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Editor').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('Editor Settings')).toBeInTheDocument();
  });

  it('switches to Agent tab on click', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Agent').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('Agent Settings')).toBeInTheDocument();
  });

  it('switches to Theme tab and shows theme options', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Theme').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('Nova Dark')).toBeInTheDocument();
  });

  it('switches to Extensions tab on click', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Extensions').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('No extensions installed')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<SettingsPanel onClose={handleClose} />);
    const settingsHeader = document.querySelector('.settings-header')!;
    fireEvent.click(settingsHeader.querySelector('button')!);
    expect(handleClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', () => {
    const handleClose = vi.fn();
    const { container } = render(<SettingsPanel onClose={handleClose} />);
    fireEvent.click(container.querySelector('.settings-overlay')!);
    expect(handleClose).toHaveBeenCalled();
  });
});
