export interface Page {
  url: string;
  title: string;
  status: string;
}

export interface Screenshot {
  dataUrl: string;
  timestamp: number;
}

export interface ScreenshotResult {
  url: string;
  title: string;
  html: string;
  status: string;
}

export interface DOMNode {
  tag: string;
  children: DOMNode[];
  attributes: Record<string, string>;
}
