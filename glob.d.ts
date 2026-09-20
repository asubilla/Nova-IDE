declare module 'glob' {
  function glob(pattern: string | string[], options?: any): Promise<string[]>;
  function glob(pattern: string | string[], callback: (err: Error | null, matches: string[]) => void): void;
  function glob(pattern: string | string[], options: any, callback: (err: Error | null, matches: string[]) => void): void;
  namespace glob {
    function sync(pattern: string | string[], options?: any): string[];
  }
  export = glob;
}
