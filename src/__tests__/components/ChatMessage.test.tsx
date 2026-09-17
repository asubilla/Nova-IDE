import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatMessage } from '../../components/ai/ChatMessage';
import type { Message } from '../../types/ai';

vi.mock('../../components/ai/ToolCallDisplay', () => ({
  ToolCallDisplay: ({ toolCall }: { toolCall: { name: string; status: string } }) => (
    <div data-testid="tool-call-display">
      {toolCall.name} - {toolCall.status}
    </div>
  ),
}));

const userMessage: Message = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello Nova',
  timestamp: Date.now(),
};

const assistantMessage: Message = {
  id: 'msg-2',
  role: 'assistant',
  content: 'Hello! How can I help?',
  timestamp: Date.now(),
  toolCalls: [
    {
      id: 'tc-1',
      name: 'read_file',
      args: { path: '/src/App.tsx' },
      status: 'success',
    },
  ],
};

describe('ChatMessage', () => {
  it('renders a user message with the user avatar', () => {
    render(<ChatMessage message={userMessage} />);
    expect(screen.getByText('U')).toBeInTheDocument();
    expect(screen.getByText('Hello Nova')).toBeInTheDocument();
  });

  it('renders an assistant message with the Nova avatar', () => {
    render(<ChatMessage message={assistantMessage} />);
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument();
  });

  it('renders tool calls when present', () => {
    render(<ChatMessage message={assistantMessage} />);
    expect(screen.getByTestId('tool-call-display')).toBeInTheDocument();
    expect(screen.getByText('read_file - success')).toBeInTheDocument();
  });

  it('does not render tool calls when message has none', () => {
    render(<ChatMessage message={userMessage} />);
    expect(screen.queryByTestId('tool-call-display')).not.toBeInTheDocument();
  });

  it('renders the timestamp', () => {
    render(<ChatMessage message={userMessage} />);
    const timeStr = new Date(userMessage.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(timeStr)).toBeInTheDocument();
  });
});
