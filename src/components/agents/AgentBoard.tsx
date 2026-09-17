import { useState, type DragEvent } from 'react';
import { useKanbanStore } from '../../store/kanbanStore';
import { useAgentStore } from '../../store/agentStore';
import AgentCard from './AgentCard';
import type { CardStatus } from '../../types/kanban';

const columnStyles: Record<CardStatus, { bg: string; border: string }> = {
  backlog:      { bg: '#13141f', border: '#1e1f2e' },
  todo:         { bg: '#13141f', border: '#1e1f2e' },
  'in-progress': { bg: '#13141f', border: '#6c5ce7' },
  done:         { bg: '#13141f', border: '#00e676' },
};

const headerColors: Record<CardStatus, string> = {
  backlog: '#8a8a9a',
  todo: '#ffd600',
  'in-progress': '#6c5ce7',
  done: '#00e676',
};

export default function AgentBoard() {
  const { board, moveCard, addCard } = useKanbanStore();
  const agents = useAgentStore((s) => s.agents);
  const [dragOverCol, setDragOverCol] = useState<CardStatus | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [addingTo, setAddingTo] = useState<CardStatus | null>(null);

  const onDragStart = (e: DragEvent, cardId: string, from: CardStatus) => {
    e.dataTransfer.setData('cardId', cardId);
    e.dataTransfer.setData('from', from);
  };

  const onDragOver = (e: DragEvent, colId: CardStatus) => {
    e.preventDefault();
    setDragOverCol(colId);
  };

  const onDrop = (e: DragEvent, to: CardStatus) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    const from = e.dataTransfer.getData('from') as CardStatus;
    if (cardId && from !== to) moveCard(cardId, from, to);
    setDragOverCol(null);
  };

  const handleAdd = (colId: CardStatus) => {
    if (newTitle.trim()) {
      addCard(colId, newTitle.trim());
      setNewTitle('');
      setAddingTo(null);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 12, height: '100%', padding: 12, overflowX: 'auto' }}>
      {board.columns.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => onDragOver(e, col.id)}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={(e) => onDrop(e, col.id)}
          style={{
            flex: '0 0 280px',
            background: columnStyles[col.id].bg,
            border: `1px solid ${dragOverCol === col.id ? headerColors[col.id] : columnStyles[col.id].border}`,
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            transition: 'border-color 0.15s',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: `1px solid ${columnStyles[col.id].border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: headerColors[col.id],
                }}
              />
              <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {col.title}
              </span>
              <span style={{ color: '#555', fontSize: 12 }}>{col.cards.length}</span>
            </div>
            <button
              onClick={() => setAddingTo(addingTo === col.id ? null : col.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#555',
                fontSize: 18,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 4px',
              }}
            >
              +
            </button>
          </div>

          {addingTo === col.id && (
            <div style={{ padding: '8px 12px' }}>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd(col.id);
                  if (e.key === 'Escape') setAddingTo(null);
                }}
                placeholder="Task title..."
                style={{
                  width: '100%',
                  background: '#0a0a0f',
                  border: '1px solid #2a2b3d',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: '#e0e0e0',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {col.cards.map((card) => {
              const agent = card.assignee ? agents.find((a) => a.name === card.assignee) : null;
              return (
                <div key={card.id} draggable onDragStart={(e) => onDragStart(e, card.id, col.id)}>
                  <AgentCard card={card} agent={agent ?? null} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
