import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BrowserPreview from '../../components/browser/BrowserPreview';

vi.mock('../../store/browserStore', () => ({
  useBrowserStore: vi.fn(() => ({
    currentUrl: '',
    screenshot: null,
    pages: [],
  })),
}));

vi.mock('../../components/browser/BrowserControls', () => ({
  default: () => <div data-testid="browser-controls">BrowserControls</div>,
}));

import { useBrowserStore } from '../../store/browserStore';
const mockUseBrowserStore = vi.mocked(useBrowserStore);

describe('BrowserPreview', () => {
  it('renders the browser controls', () => {
    mockUseBrowserStore.mockReturnValue({
      currentUrl: '',
      screenshot: null,
      pages: [],
    } as ReturnType<typeof useBrowserStore>);
    render(<BrowserPreview />);
    expect(screen.getByTestId('browser-controls')).toBeInTheDocument();
  });

  it('shows idle state when no URL', () => {
    mockUseBrowserStore.mockReturnValue({
      currentUrl: '',
      screenshot: null,
      pages: [],
    } as ReturnType<typeof useBrowserStore>);
    render(<BrowserPreview />);
    expect(screen.getByText('Enter a URL to begin')).toBeInTheDocument();
  });

  it('shows navigate prompt when URL is set but no screenshot', () => {
    mockUseBrowserStore.mockReturnValue({
      currentUrl: 'https://example.com',
      screenshot: null,
      pages: [],
    } as ReturnType<typeof useBrowserStore>);
    render(<BrowserPreview />);
    expect(screen.getByText('Navigate to capture screenshot')).toBeInTheDocument();
  });

  it('renders screenshot image when available', () => {
    mockUseBrowserStore.mockReturnValue({
      currentUrl: 'https://example.com',
      screenshot: { dataUrl: 'data:image/png;base64,abc', timestamp: Date.now() },
      pages: [],
    } as ReturnType<typeof useBrowserStore>);
    render(<BrowserPreview />);
    const img = screen.getByAltText('Screenshot');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('shows Ready status for loaded page', () => {
    mockUseBrowserStore.mockReturnValue({
      currentUrl: 'https://example.com',
      screenshot: null,
      pages: [{ url: 'https://example.com', title: 'Example', status: 'loaded' }],
    } as ReturnType<typeof useBrowserStore>);
    render(<BrowserPreview />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
