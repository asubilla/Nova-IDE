import {
  ChatMessage,
  ChatMessageType,
  MessageSearchResult,
} from './chat-types';
import { ChatDatabase } from './chat-database';

export type SearchExportFormat = 'json' | 'csv' | 'html';

export interface SearchFilter {
  from?: string;
  dateRange?: { start: Date; end: Date };
  messageType?: ChatMessageType | 'all';
  hasAttachment?: boolean;
  hasCode?: boolean;
  hasLink?: boolean;
  hasMention?: boolean;
  isPinned?: boolean;
  isBookmarked?: boolean;
  threadId?: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  sortBy?: 'relevance' | 'date';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  results: MessageSearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SavedSearch {
  name: string;
  query: string;
  filters: SearchFilter;
  createdAt: Date;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptions {
  users: FilterOption[];
  messageTypes: FilterOption[];
  datePresets: FilterOption[];
}

export class SearchFilters {
  private db: ChatDatabase;
  private savedSearches = new Map<string, SavedSearch>();

  constructor(db: ChatDatabase) {
    this.db = db;
  }

  search(query: string, filters?: SearchFilter, options?: SearchOptions): SearchResult {
    const opts: Required<SearchOptions> = {
      caseSensitive: options?.caseSensitive ?? false,
      wholeWord: options?.wholeWord ?? false,
      useRegex: options?.useRegex ?? false,
      sortBy: options?.sortBy ?? 'relevance',
      sortDirection: options?.sortDirection ?? 'desc',
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 20,
    };

    let matcher: (content: string) => boolean;
    if (opts.useRegex) {
      try {
        const flags = opts.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(query, flags);
        matcher = (content) => regex.test(content);
      } catch {
        matcher = () => false;
      }
    } else if (opts.wholeWord) {
      const pattern = opts.caseSensitive ? query : query.toLowerCase();
      const wordRegex = new RegExp(`\\b${this.escapeRegex(pattern)}\\b`, opts.caseSensitive ? '' : 'i');
      matcher = (content) => wordRegex.test(content);
    } else if (opts.caseSensitive) {
      matcher = (content) => content.includes(query);
    } else {
      const lower = query.toLowerCase();
      matcher = (content) => content.toLowerCase().includes(lower);
    }

    const sessions = this.db.listSessions();
    let allResults: MessageSearchResult[] = [];

    for (const session of sessions) {
      const paginated = this.db.getMessagesBySession(session.id, { limit: 10000, offset: 0 });
      for (const msg of paginated.messages) {
        if (msg.deletedAt) continue;
        if (!matcher(msg.content)) continue;
        if (!this.matchesFilters(msg, filters)) continue;

        allResults.push({
          message: msg,
          sessionTitle: session.title,
          snippet: this.highlightSnippet(msg.content, query, opts),
        });
      }
    }

    allResults = this.sortResults(allResults, opts.sortBy, opts.sortDirection);

    const totalCount = allResults.length;
    const start = (opts.page - 1) * opts.pageSize;
    const paginatedResults = allResults.slice(start, start + opts.pageSize);

    return {
      results: paginatedResults,
      totalCount,
      page: opts.page,
      pageSize: opts.pageSize,
      hasMore: start + opts.pageSize < totalCount,
    };
  }

  getFilters(): FilterOptions {
    const sessions = this.db.listSessions();
    const userSet = new Set<string>();
    for (const session of sessions) {
      for (const p of session.participants) {
        userSet.add(p);
      }
    }

    return {
      users: Array.from(userSet).map((u) => ({ value: u, label: u })),
      messageTypes: [
        { value: 'all', label: 'All Types' },
        { value: ChatMessageType.Text, label: 'Text' },
        { value: ChatMessageType.Code, label: 'Code' },
        { value: ChatMessageType.Image, label: 'Image' },
        { value: ChatMessageType.File, label: 'File' },
        { value: ChatMessageType.System, label: 'System' },
        { value: ChatMessageType.AgentResponse, label: 'Agent Response' },
      ],
      datePresets: [
        { value: 'today', label: 'Today' },
        { value: 'week', label: 'This Week' },
        { value: 'month', label: 'This Month' },
        { value: 'all', label: 'All Time' },
      ],
    };
  }

  renderFilterUI(): string {
    const filters = this.getFilters();
    const userOptions = filters.users
      .map((u) => `<option value="${u.value}">${u.label}</option>`)
      .join('');
    const typeOptions = filters.messageTypes
      .map((t) => `<option value="${t.value}">${t.label}</option>`)
      .join('');

    return `
<div class="search-filters">
  <div class="filter-group">
    <label>From</label>
    <select class="filter-from">${userOptions}</select>
  </div>
  <div class="filter-group">
    <label>Date Range</label>
    <input type="date" class="filter-date-start" />
    <input type="date" class="filter-date-end" />
  </div>
  <div class="filter-group">
    <label>Message Type</label>
    <select class="filter-type">${typeOptions}</select>
  </div>
  <div class="filter-group">
    <label><input type="checkbox" class="filter-attachment" /> Has Attachment</label>
    <label><input type="checkbox" class="filter-code" /> Has Code</label>
    <label><input type="checkbox" class="filter-link" /> Has Link</label>
    <label><input type="checkbox" class="filter-mention" /> Has Mention</label>
    <label><input type="checkbox" class="filter-pinned" /> Is Pinned</label>
    <label><input type="checkbox" class="filter-bookmarked" /> Is Bookmarked</label>
  </div>
  <div class="filter-group">
    <label>Options</label>
    <label><input type="checkbox" class="filter-case" /> Case Sensitive</label>
    <label><input type="checkbox" class="filter-whole" /> Whole Word</label>
    <label><input type="checkbox" class="filter-regex" /> Regex</label>
  </div>
</div>`;
  }

  saveSearch(name: string, query: string, filters: SearchFilter): SavedSearch {
    const search: SavedSearch = {
      name,
      query,
      filters: { ...filters },
      createdAt: new Date(),
    };
    this.savedSearches.set(name, search);
    return search;
  }

  getSavedSearches(): SavedSearch[] {
    return Array.from(this.savedSearches.values());
  }

  deleteSavedSearch(name: string): boolean {
    return this.savedSearches.delete(name);
  }

  exportResults(results: MessageSearchResult[], format: SearchExportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(
          results.map((r) => ({
            id: r.message.id,
            sessionId: r.message.sessionId,
            sessionTitle: r.sessionTitle,
            senderId: r.message.senderId,
            content: r.message.content,
            type: r.message.type,
            createdAt: r.message.createdAt,
            snippet: r.snippet,
          })),
          null,
          2,
        );
      case 'csv':
        return this.resultsToCsv(results);
      case 'html':
        return this.resultsToHtml(results);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private matchesFilters(msg: ChatMessage, filters?: SearchFilter): boolean {
    if (!filters) return true;

    if (filters.from && msg.senderId !== filters.from) return false;

    if (filters.dateRange) {
      const msgTime = msg.createdAt.getTime();
      if (msgTime < filters.dateRange.start.getTime()) return false;
      if (msgTime > filters.dateRange.end.getTime()) return false;
    }

    if (filters.messageType && filters.messageType !== 'all' && msg.type !== filters.messageType) {
      return false;
    }

    if (filters.hasCode === true && msg.type !== ChatMessageType.Code) return false;

    if (filters.hasAttachment === true) {
      const atts = this.db.getAttachmentsByMessage(msg.id);
      if (atts.length === 0) return false;
    }

    if (filters.hasLink === true) {
      const urlRegex = /https?:\/\/[^\s]+/i;
      if (!urlRegex.test(msg.content)) return false;
    }

    if (filters.hasMention === true) {
      const mentionRegex = /@\w+/;
      if (!mentionRegex.test(msg.content)) return false;
    }

    if (filters.threadId && msg.replyTo !== filters.threadId) return false;

    return true;
  }

  private highlightSnippet(content: string, query: string, opts: Required<SearchOptions>): string {
    const maxLen = 120;
    const lowerContent = opts.caseSensitive ? content : content.toLowerCase();
    const lowerQuery = opts.caseSensitive ? query : query.toLowerCase();

    let idx = -1;
    if (opts.useRegex) {
      try {
        const regex = new RegExp(query, opts.caseSensitive ? '' : 'i');
        const match = regex.exec(content);
        if (match) idx = match.index;
      } catch {
        idx = lowerContent.indexOf(lowerQuery);
      }
    } else {
      idx = lowerContent.indexOf(lowerQuery);
    }

    if (idx === -1) {
      return content.length > maxLen ? content.slice(0, maxLen) + '...' : content;
    }

    const start = Math.max(0, idx - 40);
    const end = Math.min(content.length, idx + query.length + 40);
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    if (!opts.caseSensitive) {
      const highlighted = snippet.replace(
        new RegExp(this.escapeRegex(query), 'gi'),
        (match) => `<mark>${match}</mark>`,
      );
      return highlighted;
    }

    return snippet.replace(
      new RegExp(this.escapeRegex(query), 'g'),
      (match) => `<mark>${match}</mark>`,
    );
  }

  private sortResults(
    results: MessageSearchResult[],
    sortBy: 'relevance' | 'date',
    direction: 'asc' | 'desc',
  ): MessageSearchResult[] {
    const dir = direction === 'asc' ? 1 : -1;

    if (sortBy === 'date') {
      return results.sort(
        (a, b) => dir * (a.message.createdAt.getTime() - b.message.createdAt.getTime()),
      );
    }

    return results.sort((a, b) => dir * (b.snippet.length - a.snippet.length));
  }

  private resultsToCsv(results: MessageSearchResult[]): string {
    const lines = ['ID,Session,Sender,Type,Content,Created At'];
    for (const r of results) {
      const content = `"${r.message.content.replace(/"/g, '""')}"`;
      lines.push(
        `${r.message.id},"${r.sessionTitle ?? ''}",${r.message.senderId},${r.message.type},${content},${r.message.createdAt.toISOString()}`,
      );
    }
    return lines.join('\n');
  }

  private resultsToHtml(results: MessageSearchResult[]): string {
    const rows = results
      .map(
        (r) => `<tr>
  <td>${r.message.id}</td>
  <td>${r.sessionTitle ?? ''}</td>
  <td>${r.message.senderId}</td>
  <td>${r.message.type}</td>
  <td>${r.snippet}</td>
  <td>${r.message.createdAt.toLocaleString()}</td>
</tr>`,
      )
      .join('\n');

    return `<!DOCTYPE html>
<html>
<head><title>Search Results</title>
<style>
  body { font-family: sans-serif; padding: 20px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f4f4f4; }
  mark { background: #fef08a; padding: 0 2px; }
</style>
</head>
<body>
<h1>Search Results (${results.length})</h1>
<table>
<tr><th>ID</th><th>Session</th><th>Sender</th><th>Type</th><th>Snippet</th><th>Date</th></tr>
${rows}
</table>
</body></html>`;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
