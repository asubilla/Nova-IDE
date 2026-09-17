import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MCPBrowser from '../../components/tools/MCPBrowser';

const mockSearchTools = vi.fn();

vi.mock('../../store/mcpRegistryStore', () => ({
  useMCPRegistryStore: vi.fn(() => ({
    searchQuery: '',
    filteredServers: [
      {
        name: 'GitHub MCP',
        description: 'Manage repos, issues, PRs',
        category: 'Development',
        tools: [{ name: 'create_issue', description: 'Create issue', params: {} }],
      },
      {
        name: 'Supabase MCP',
        description: 'Database queries',
        category: 'Database',
        tools: [{ name: 'query', description: 'Run SQL', params: {} }],
      },
    ],
    searchTools: mockSearchTools,
  })),
}));

vi.mock('../../components/tools/MCPToolCard', () => ({
  default: ({ server }: { server: { name: string } }) => (
    <div data-testid="mcp-tool-card">{server.name}</div>
  ),
}));

import { useMCPRegistryStore } from '../../store/mcpRegistryStore';
const mockUseMCPRegistryStore = vi.mocked(useMCPRegistryStore);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MCPBrowser', () => {
  it('renders the MCP Tool Registry header', () => {
    render(<MCPBrowser />);
    expect(screen.getByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('Tool Registry')).toBeInTheDocument();
  });

  it('renders all tool cards from the store', () => {
    render(<MCPBrowser />);
    expect(screen.getByText('GitHub MCP')).toBeInTheDocument();
    expect(screen.getByText('Supabase MCP')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    render(<MCPBrowser />);
    expect(screen.getByPlaceholderText('Search tools...')).toBeInTheDocument();
  });

  it('calls searchTools when typing in the search bar', () => {
    render(<MCPBrowser />);
    const input = screen.getByPlaceholderText('Search tools...');
    fireEvent.change(input, { target: { value: 'github' } });
    expect(mockSearchTools).toHaveBeenCalledWith('github');
  });

  it('renders category sidebar', () => {
    render(<MCPBrowser />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
  });

  it('shows "No tools found" when filteredServers is empty', () => {
    mockUseMCPRegistryStore.mockReturnValue({
      searchQuery: '',
      filteredServers: [],
      searchTools: mockSearchTools,
    });
    render(<MCPBrowser />);
    expect(screen.getByText('No tools found')).toBeInTheDocument();
  });
});
