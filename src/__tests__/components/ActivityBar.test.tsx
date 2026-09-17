import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActivityBar } from '../../components/layout/ActivityBar';

describe('ActivityBar', () => {
  it('renders all activity icons with titles', () => {
    render(<ActivityBar />);
    const labels = ['Explorer', 'Search', 'Git', 'Agents', 'MCP', 'Memory', 'Browser', 'Settings'];
    labels.forEach((label) => {
      expect(screen.getByTitle(label)).toBeInTheDocument();
    });
  });

  it('applies active class to the active item', () => {
    render(<ActivityBar activeItem="git" />);
    const gitButton = screen.getByTitle('Git');
    expect(gitButton.className).toContain('active');
  });

  it('calls onItemSelect when an item is clicked', () => {
    const handleSelect = vi.fn();
    render(<ActivityBar onItemSelect={handleSelect} />);
    fireEvent.click(screen.getByTitle('Agents'));
    expect(handleSelect).toHaveBeenCalledWith('agents');
  });

  it('shows badge counts for items that have them', () => {
    render(<ActivityBar />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('defaults to explorer as active', () => {
    render(<ActivityBar />);
    const explorerButton = screen.getByTitle('Explorer');
    expect(explorerButton.className).toContain('active');
  });
});
