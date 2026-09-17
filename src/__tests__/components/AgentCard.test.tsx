import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AgentCard from '../../components/agents/AgentCard';
import type { Card } from '../../types/kanban';
import type { Agent } from '../../types/agent';

const mockCard: Card = {
  id: 'card-1',
  title: 'Build auth module',
  assignee: 'Nova-1',
  status: 'in-progress',
  progress: 45,
  tags: ['feature', 'auth'],
};

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'Nova-1',
  status: 'running',
  task: 'Build auth module',
  progress: 45,
  startTime: Date.now(),
};

describe('AgentCard', () => {
  it('renders the task title', () => {
    render(<AgentCard card={mockCard} agent={mockAgent} />);
    expect(screen.getByText('Build auth module')).toBeInTheDocument();
  });

  it('renders the status badge', () => {
    render(<AgentCard card={mockCard} agent={mockAgent} />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('shows the progress bar when progress > 0', () => {
    render(<AgentCard card={mockCard} agent={mockAgent} />);
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('does not show progress bar when progress is 0', () => {
    const cardNoProgress = { ...mockCard, progress: 0 };
    render(<AgentCard card={cardNoProgress} agent={mockAgent} />);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<AgentCard card={mockCard} agent={mockAgent} />);
    expect(screen.getByText('feature')).toBeInTheDocument();
    expect(screen.getByText('auth')).toBeInTheDocument();
  });

  it('renders assignee name', () => {
    render(<AgentCard card={mockCard} agent={mockAgent} />);
    expect(screen.getByText('Nova-1')).toBeInTheDocument();
  });
});
