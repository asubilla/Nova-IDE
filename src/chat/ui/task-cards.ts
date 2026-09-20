export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskCard {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  dueDate: Date | null;
  createdAt: Date;
  tags: string[];
  sourceMessageId: string | null;
}

export interface TaskCardConfig {
  onTaskCreated?: (task: TaskCard) => void;
  onTaskUpdated?: (task: TaskCard) => void;
  onTaskDeleted?: (taskId: string) => void;
  onTaskToggled?: (task: TaskCard) => void;
}

interface TaskCardState {
  tasks: Map<string, TaskCard>;
  sessionTasks: Map<string, Set<string>>;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export class TaskCards {
  private config: TaskCardConfig;
  private state: TaskCardState;
  private taskIdCounter = 0;

  constructor(config?: TaskCardConfig) {
    this.config = {
      onTaskCreated: config?.onTaskCreated ?? (() => {}),
      onTaskUpdated: config?.onTaskUpdated ?? (() => {}),
      onTaskDeleted: config?.onTaskDeleted ?? (() => {}),
      onTaskToggled: config?.onTaskToggled ?? (() => {}),
    };
    this.state = {
      tasks: new Map(),
      sessionTasks: new Map(),
    };
  }

  createTaskFromMessage(message: { id: string; sessionId: string; content: string; senderId: string }): TaskCard {
    const task: TaskCard = {
      id: `task-${++this.taskIdCounter}`,
      title: this.extractTitle(message.content),
      description: message.content,
      status: 'todo',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      createdAt: new Date(),
      tags: this.extractTags(message.content),
      sourceMessageId: message.id,
    };

    this.state.tasks.set(task.id, task);

    if (!this.state.sessionTasks.has(message.sessionId)) {
      this.state.sessionTasks.set(message.sessionId, new Set());
    }
    this.state.sessionTasks.get(message.sessionId)!.add(task.id);

    this.config.onTaskCreated?.(task);
    return task;
  }

  renderTaskCard(task: TaskCard): HTMLElement {
    const el = document.createElement('div');
    el.className = `task-card task-card-${task.status} task-card-priority-${task.priority}`;
    el.setAttribute('data-task-id', task.id);
    el.setAttribute('role', 'article');
    el.setAttribute('aria-label', `Task: ${task.title}`);

    const dueDateStr = task.dueDate
      ? task.dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    const isOverdue = task.dueDate && task.dueDate < new Date() && task.status !== 'done';
    const tagsHtml = task.tags.map((t) => `<span class="task-tag">${this.escapeHtml(t)}</span>`).join('');

    el.innerHTML = `
      <div class="task-card-header">
        <button class="task-checkbox" role="checkbox" aria-checked="${task.status === 'done'}" aria-label="Toggle completion">
          ${task.status === 'done' ? '&#10003;' : ''}
        </button>
        <span class="task-title ${task.status === 'done' ? 'task-title-done' : ''}">${this.escapeHtml(task.title)}</span>
        <span class="task-priority-badge task-priority-${task.priority}">${this.escapeHtml(task.priority)}</span>
      </div>
      <div class="task-card-body">
        <p class="task-description">${this.escapeHtml(task.description)}</p>
      </div>
      <div class="task-card-footer">
        <div class="task-meta">
          ${task.assignee ? `<span class="task-assignee">&#128100; ${this.escapeHtml(task.assignee)}</span>` : ''}
          ${dueDateStr ? `<span class="task-due ${isOverdue ? 'task-overdue' : ''}">&#128197; ${dueDateStr}</span>` : ''}
        </div>
        <div class="task-tags">${tagsHtml}</div>
      </div>
    `;

    const checkbox = el.querySelector('.task-checkbox') as HTMLButtonElement;
    checkbox.addEventListener('click', () => this.toggleComplete(task.id));

    const deleteBtn = el.querySelector('.task-card-delete') as HTMLButtonElement;
    deleteBtn?.addEventListener('click', () => this.deleteTask(task.id));

    return el;
  }

  updateTask(taskId: string, updates: Partial<Omit<TaskCard, 'id' | 'createdAt'>>): TaskCard | null {
    const task = this.state.tasks.get(taskId);
    if (!task) return null;

    Object.assign(task, updates);
    this.config.onTaskUpdated?.(task);
    return task;
  }

  deleteTask(taskId: string): boolean {
    const task = this.state.tasks.get(taskId);
    if (!task) return false;

    this.state.tasks.delete(taskId);
    for (const [, taskIds] of this.state.sessionTasks) {
      taskIds.delete(taskId);
    }
    this.config.onTaskDeleted?.(taskId);
    return true;
  }

  getTasks(sessionId: string): TaskCard[] {
    const taskIds = this.state.sessionTasks.get(sessionId);
    if (!taskIds) return [];

    return Array.from(taskIds)
      .map((id) => this.state.tasks.get(id))
      .filter((t): t is TaskCard => t !== undefined)
      .sort((a, b) => {
        const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (pDiff !== 0) return pDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  renderTaskList(tasks: TaskCard[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'task-list';
    container.setAttribute('role', 'list');
    container.setAttribute('aria-label', 'Task list');

    if (tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'task-list-empty';
      empty.textContent = 'No tasks';
      container.appendChild(empty);
      return container;
    }

    for (const task of tasks) {
      const card = this.renderTaskCard(task);
      card.setAttribute('role', 'listitem');
      container.appendChild(card);
    }

    return container;
  }

  toggleComplete(taskId: string): TaskCard | null {
    const task = this.state.tasks.get(taskId);
    if (!task) return null;

    task.status = task.status === 'done' ? 'todo' : 'done';
    this.config.onTaskToggled?.(task);
    return task;
  }

  setPriority(taskId: string, priority: TaskPriority): TaskCard | null {
    return this.updateTask(taskId, { priority });
  }

  assignTask(taskId: string, userId: string): TaskCard | null {
    return this.updateTask(taskId, { assignee: userId });
  }

  getAllTasks(): TaskCard[] {
    return Array.from(this.state.tasks.values());
  }

  private extractTitle(content: string): string {
    const lines = content.split('\n').filter((l) => l.trim());
    const first = lines[0] ?? '';
    const title = first.replace(/^#+\s*/, '').replace(/[*_`]/g, '');
    return title.length > 120 ? title.substring(0, 117) + '...' : title;
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const tagMatches = content.match(/#(\w+)/g);
    if (tagMatches) {
      for (const tag of tagMatches) {
        const clean = tag.substring(1).toLowerCase();
        if (!tags.includes(clean)) tags.push(clean);
      }
    }
    return tags;
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
