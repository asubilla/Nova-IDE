import React from 'react';
import type { Message } from '../../types/ai';
import { ToolCallDisplay } from './ToolCallDisplay';

const colors = {
  bg: '#0a0a0f',
  accent: '#6c5ce7',
  text: '#e4e4f0',
  secondary: '#7a7c94',
  surface: '#12121a',
  border: '#1e1e2e',
  green: '#00b894',
  cyan: '#00cec9',
  blue: '#0984e3',
};

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  const renderContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).replace(/^\w*\n/, '');
        return (
          <pre
            key={i}
            style={{
              background: '#0d0d15',
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: '12px 14px',
              margin: '8px 0',
              overflowX: 'auto',
              fontFamily: "'Fira Code', 'Consolas', monospace",
              fontSize: 13,
              lineHeight: 1.5,
              color: '#c0c0d0',
            }}
          >
            <code>{code}</code>
          </pre>
        );
      }
      const inlineParts = part.split(/(`[^`]+`)/g);
      return (
        <span key={i}>
          {inlineParts.map((ip, j) => {
            if (ip.startsWith('`') && ip.endsWith('`')) {
              return (
                <code
                  key={j}
                  style={{
                    background: '#1a1a28',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    fontSize: 13,
                    color: colors.accent,
                  }}
                >
                  {ip.slice(1, -1)}
                </code>
              );
            }
            return <span key={j}>{ip}</span>;
          })}
        </span>
      );
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '16px 20px',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          color: '#fff',
          flexShrink: 0,
          background: isUser
            ? 'linear-gradient(135deg, #0984e3, #6c5ce7)'
            : 'linear-gradient(135deg, #00cec9, #6c5ce7)',
        }}
      >
        {isUser ? 'U' : 'N'}
      </div>

      <div
        style={{
          maxWidth: '75%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            background: isUser ? colors.accent + '18' : colors.surface,
            border: `1px solid ${isUser ? colors.accent + '30' : colors.border}`,
            borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
            padding: '12px 16px',
            fontSize: 14,
            lineHeight: 1.6,
            color: colors.text,
            whiteSpace: 'pre-wrap',
          }}
        >
          {renderContent(message.content)}
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {message.toolCalls.map((tc) => (
              <ToolCallDisplay key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        <div
          style={{
            fontSize: 11,
            color: colors.secondary,
            textAlign: isUser ? 'right' : 'left',
            paddingLeft: isUser ? 0 : 4,
            paddingRight: isUser ? 4 : 0,
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
};
