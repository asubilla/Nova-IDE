import { act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useKanbanStore } from '../../store/kanbanStore';

beforeEach(() => {
  useKanbanStore.setState({
    board: {
      id: 'main',
      columns: [
        { id: 'backlog', title: 'Backlog', cards: [] },
        { id: 'todo', title: 'Todo', cards: [] },
        { id: 'in-progress', title: 'In Progress', cards: [] },
        { id: 'done', title: 'Done', cards: [] },
      ],
    },
  });
});

describe('kanbanStore', () => {
  it('has correct initial state with empty board', () => {
    const { board } = useKanbanStore.getState();
    expect(board.id).toBe('main');
    expect(board.columns).toHaveLength(4);
    board.columns.forEach((col) => {
      expect(col.cards).toHaveLength(0);
    });
  });

  it('addCard adds a card to the specified column', () => {
    act(() => {
      useKanbanStore.getState().addCard('todo', 'New Feature', ['feature']);
    });
    const { board } = useKanbanStore.getState();
    const todoCol = board.columns.find((c) => c.id === 'todo')!;
    expect(todoCol.cards).toHaveLength(1);
    expect(todoCol.cards[0].title).toBe('New Feature');
    expect(todoCol.cards[0].tags).toEqual(['feature']);
    expect(todoCol.cards[0].status).toBe('todo');
  });

  it('moveCard moves a card between columns', () => {
    let cardId = '';
    act(() => {
      useKanbanStore.getState().addCard('backlog', 'Task');
      const backlog = useKanbanStore.getState().board.columns.find((c) => c.id === 'backlog')!;
      cardId = backlog.cards[0].id;
    });
    act(() => {
      useKanbanStore.getState().moveCard(cardId, 'backlog', 'done');
    });
    const { board } = useKanbanStore.getState();
    expect(board.columns.find((c) => c.id === 'backlog')!.cards).toHaveLength(0);
    const doneCol = board.columns.find((c) => c.id === 'done')!;
    expect(doneCol.cards).toHaveLength(1);
    expect(doneCol.cards[0].status).toBe('done');
    expect(doneCol.cards[0].progress).toBe(100);
  });

  it('assignAgent sets the assignee on a card', () => {
    let cardId = '';
    act(() => {
      useKanbanStore.getState().addCard('todo', 'Task');
      const todo = useKanbanStore.getState().board.columns.find((c) => c.id === 'todo')!;
      cardId = todo.cards[0].id;
    });
    act(() => {
      useKanbanStore.getState().assignAgent(cardId, 'Nova-3');
    });
    const { board } = useKanbanStore.getState();
    const card = board.columns.find((c) => c.id === 'todo')!.cards[0];
    expect(card.assignee).toBe('Nova-3');
  });

  it('updateCardProgress clamps progress to 0-100', () => {
    let cardId = '';
    act(() => {
      useKanbanStore.getState().addCard('in-progress', 'Task');
      const col = useKanbanStore.getState().board.columns.find((c) => c.id === 'in-progress')!;
      cardId = col.cards[0].id;
    });
    act(() => {
      useKanbanStore.getState().updateCardProgress(cardId, 200);
    });
    expect(useKanbanStore.getState().board.columns.find((c) => c.id === 'in-progress')!.cards[0].progress).toBe(100);

    act(() => {
      useKanbanStore.getState().updateCardProgress(cardId, -50);
    });
    expect(useKanbanStore.getState().board.columns.find((c) => c.id === 'in-progress')!.cards[0].progress).toBe(0);
  });

  it('removeCard removes a card from the column', () => {
    let cardId = '';
    act(() => {
      useKanbanStore.getState().addCard('backlog', 'Task');
      const col = useKanbanStore.getState().board.columns.find((c) => c.id === 'backlog')!;
      cardId = col.cards[0].id;
    });
    act(() => {
      useKanbanStore.getState().removeCard(cardId, 'backlog');
    });
    expect(useKanbanStore.getState().board.columns.find((c) => c.id === 'backlog')!.cards).toHaveLength(0);
  });
});
