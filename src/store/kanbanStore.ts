import { create } from 'zustand';
import type { Board, Card, CardStatus } from '../types/kanban';

const uid = () => Math.random().toString(36).slice(2, 10);

interface KanbanState {
  board: Board;
  moveCard: (cardId: string, from: CardStatus, to: CardStatus) => void;
  addCard: (columnId: CardStatus, title: string, tags?: string[]) => void;
  assignAgent: (cardId: string, agentName: string) => void;
  updateCardProgress: (cardId: string, progress: number) => void;
  removeCard: (cardId: string, columnId: CardStatus) => void;
}

const initialBoard: Board = {
  id: 'main',
  columns: [
    {
      id: 'backlog',
      title: 'Backlog',
      cards: [
        { id: uid(), title: 'Research dark mode tokens', assignee: null, status: 'backlog', progress: 0, tags: ['research'] },
        { id: uid(), title: 'Design system audit', assignee: null, status: 'backlog', progress: 0, tags: ['design'] },
      ],
    },
    {
      id: 'todo',
      title: 'Todo',
      cards: [
        { id: uid(), title: 'Implement search', assignee: null, status: 'todo', progress: 0, tags: ['feature'] },
        { id: uid(), title: 'Fix login redirect', assignee: null, status: 'todo', progress: 0, tags: ['bug'] },
      ],
    },
    {
      id: 'in-progress',
      title: 'In Progress',
      cards: [
        { id: uid(), title: 'Build agent panel', assignee: 'Nova-1', status: 'in-progress', progress: 45, tags: ['feature', 'agents'] },
        { id: uid(), title: 'Wire kanban DnD', assignee: 'Nova-2', status: 'in-progress', progress: 20, tags: ['feature'] },
      ],
    },
    {
      id: 'done',
      title: 'Done',
      cards: [
        { id: uid(), title: 'Setup Vite config', assignee: 'Nova-0', status: 'done', progress: 100, tags: ['infra'] },
      ],
    },
  ],
};

export const useKanbanStore = create<KanbanState>((set) => ({
  board: initialBoard,

  moveCard: (cardId, from, to) =>
    set((s) => {
      const columns = s.board.columns.map((c) => ({ ...c, cards: [...c.cards] }));
      const srcCol = columns.find((c) => c.id === from);
      const dstCol = columns.find((c) => c.id === to);
      if (!srcCol || !dstCol) return s;
      const idx = srcCol.cards.findIndex((c) => c.id === cardId);
      if (idx === -1) return s;
      const [card] = srcCol.cards.splice(idx, 1);
      card.status = to;
      if (to === 'done') card.progress = 100;
      dstCol.cards.push(card);
      return { board: { ...s.board, columns } };
    }),

  addCard: (columnId, title, tags = []) =>
    set((s) => {
      const columns = s.board.columns.map((c) => ({ ...c, cards: [...c.cards] }));
      const col = columns.find((c) => c.id === columnId);
      if (!col) return s;
      col.cards.push({
        id: uid(),
        title,
        assignee: null,
        status: columnId,
        progress: 0,
        tags,
      });
      return { board: { ...s.board, columns } };
    }),

  assignAgent: (cardId, agentName) =>
    set((s) => ({
      board: {
        ...s.board,
        columns: s.board.columns.map((c) => ({
          ...c,
          cards: c.cards.map((card) =>
            card.id === cardId ? { ...card, assignee: agentName } : card,
          ),
        })),
      },
    })),

  updateCardProgress: (cardId, progress) =>
    set((s) => ({
      board: {
        ...s.board,
        columns: s.board.columns.map((c) => ({
          ...c,
          cards: c.cards.map((card) =>
            card.id === cardId ? { ...card, progress: Math.min(100, Math.max(0, progress)) } : card,
          ),
        })),
      },
    })),

  removeCard: (cardId, columnId) =>
    set((s) => ({
      board: {
        ...s.board,
        columns: s.board.columns.map((c) =>
          c.id === columnId
            ? { ...c, cards: c.cards.filter((card) => card.id !== cardId) }
            : c,
        ),
      },
    })),
}));
