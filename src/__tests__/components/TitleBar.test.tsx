import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TitleBar } from '../../components/layout/TitleBar';

describe('TitleBar', () => {
  it('renders the NOVA IDE logo text', () => {
    render(<TitleBar />);
    expect(screen.getByText('NOVA IDE')).toBeInTheDocument();
  });

  it('renders all menu items', () => {
    render(<TitleBar />);
    const menuItems = ['File', 'Edit', 'View', 'Agent', 'Tools', 'Help'];
    menuItems.forEach((item) => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  it('renders the search bar with placeholder', () => {
    render(<TitleBar />);
    const searchInput = screen.getByPlaceholderText('Search files, commands, agents...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders the Ctrl+K hint', () => {
    render(<TitleBar />);
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
  });
});
