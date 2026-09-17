export interface Page {
  url: string;
  title: string;
  status: 'loading' | 'loaded' | 'error';
}

export interface Screenshot {
  dataUrl: string;
  timestamp: number;
}

export interface DOMNode {
  tag: string;
  children: DOMNode[];
  attributes: Record<string, string>;
}
