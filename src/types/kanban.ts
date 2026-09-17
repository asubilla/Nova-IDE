export type CardStatus = 'backlog' | 'todo' | 'in-progress' | 'done';

export interface Card {
  id: string;
  title: string;
  assignee: string | null;
  status: CardStatus;
  progress: number;
  tags: string[];
}

export interface Column {
  id: CardStatus;
  title: string;
  cards: Card[];
}

export interface Board {
  id: string;
  columns: Column[];
}
