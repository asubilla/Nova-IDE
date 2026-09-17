import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    theme: 'dark',
    fontSize: 14,
    tabSize: 4,
    autoSave: true,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
    minimap: true,
    lineNumbers: true,
    wordWrap: false,
    fontFamily: 'monospace',
  }),
}));

import { SettingsPanel } from '../../components/settings/SettingsPanel';

vi.mock('../../components/settings/AISettings', () => ({
  AISettings: () => <div data-testid="ai-settings">AI Settings Content</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPanel', () => {
  it('renders the settings title', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(await screen.findByText('Settings')).toBeInTheDocument();
  });

  it('renders all tab buttons', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    await screen.findByText('Settings');
    const tabContainer = document.querySelector('.settings-tabs')!;
    expect(tabContainer).toHaveTextContent('AI');
    expect(tabContainer).toHaveTextContent('Editor');
    expect(tabContainer).toHaveTextContent('Agent');
    expect(tabContainer).toHaveTextContent('Theme');
    expect(tabContainer).toHaveTextContent('Extensions');
  });

  it('defaults to AI tab and renders AI settings', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(await screen.findByTestId('ai-settings')).toBeInTheDocument();
  });

  it('switches to Editor tab on click', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    await screen.findByText('Settings');
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Editor').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('Editor Settings')).toBeInTheDocument();
  });

  it('switches to Agent tab on click', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    await screen.findByText('Settings');
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Agent').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('Agent Settings')).toBeInTheDocument();
  });

  it('switches to Theme tab and shows theme options', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    await screen.findByText('Settings');
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Theme').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('dark')).toBeInTheDocument();
  });

  it('switches to Extensions tab on click', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    await screen.findByText('Settings');
    const tabContainer = document.querySelector('.settings-tabs')!;
    fireEvent.click(screen.getAllByText('Extensions').find((el) => tabContainer.contains(el))!);
    expect(screen.getByText('No extensions installed')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    render(<SettingsPanel onClose={handleClose} />);
    await screen.findByText('Settings');
    const settingsHeader = document.querySelector('.settings-header')!;
    fireEvent.click(settingsHeader.querySelector('button')!);
    expect(handleClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', async () => {
    const handleClose = vi.fn();
    const { container } = render(<SettingsPanel onClose={handleClose} />);
    await screen.findByText('Settings');
    fireEvent.click(container.querySelector('.settings-overlay')!);
    expect(handleClose).toHaveBeenCalled();
  });
});
