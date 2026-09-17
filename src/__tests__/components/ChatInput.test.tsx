import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatInput } from '../../components/ai/ChatInput';

describe('ChatInput', () => {
  it('renders the textarea with placeholder', () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText('Ask Nova AI anything...')).toBeInTheDocument();
  });

  it('renders the send button', () => {
    render(<ChatInput onSend={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders toolbar buttons', () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByText('Auto-Fix')).toBeInTheDocument();
    expect(screen.getByText('Issue List')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
  });

  it('calls onSend with the typed content when send is clicked', () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} />);
    const textarea = screen.getByPlaceholderText('Ask Nova AI anything...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    const sendButton = textarea.parentElement!.querySelector('button')!;
    fireEvent.click(sendButton);
    expect(handleSend).toHaveBeenCalledWith('Hello');
  });

  it('does not send empty messages', () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} />);
    const textarea = screen.getByPlaceholderText('Ask Nova AI anything...');
    const sendButton = textarea.parentElement!.querySelector('button')!;
    fireEvent.click(sendButton);
    expect(handleSend).not.toHaveBeenCalled();
  });

  it('disables send button when isLoading', () => {
    render(<ChatInput onSend={vi.fn()} isLoading />);
    const textarea = screen.getByPlaceholderText('Ask Nova AI anything...');
    const sendButton = textarea.parentElement!.querySelector('button')!;
    expect(sendButton).toBeDisabled();
  });
});
