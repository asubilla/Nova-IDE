import * as fs from "fs";
import * as path from "path";

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
  minimap: boolean;
  lineNumbers: boolean;
}

export interface TerminalSettings {
  shell: string;
  fontSize: number;
}

export interface FilesSettings {
  autoSave: boolean;
  exclude: string[];
}

export interface AISettings {
  provider: string;
  model: string;
  temperature: number;
}

export interface ExtensionsSettings {
  enabled: string[];
}

export interface IDESettings {
  editor: EditorSettings;
  theme: string;
  terminal: TerminalSettings;
  files: FilesSettings;
  ai: AISettings;
  extensions: ExtensionsSettings;
}

const DEFAULT_SETTINGS: IDESettings = {
  editor: {
    fontSize: 14,
    fontFamily: "Consolas",
    tabSize: 2,
    wordWrap: "off",
    minimap: true,
    lineNumbers: true,
  },
  theme: "dark",
  terminal: {
    shell: "powershell",
    fontSize: 14,
  },
  files: {
    autoSave: true,
    exclude: ["node_modules", "dist", ".git"],
  },
  ai: {
    provider: "openai",
    model: "gpt-4",
    temperature: 0.7,
  },
  extensions: {
    enabled: [],
  },
};

export class Settings {
  private settings: IDESettings;
  private settingsPath: string;

  constructor(projectPath?: string) {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.settingsPath = projectPath
      ? path.join(projectPath, ".nova", "settings.json")
      : path.join(process.cwd(), ".nova", "settings.json");
  }

  load(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, "utf-8");
        const parsed = JSON.parse(data);
        this.settings = this.deepMerge(
          JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
          parsed
        );
      }
    } catch {
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  save(): void {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), "utf-8");
    } catch (err) {
      throw new Error(`Failed to save settings: ${err}`);
    }
  }

  get<K extends keyof IDESettings>(key: K): IDESettings[K] {
    return this.settings[key];
  }

  set<K extends keyof IDESettings>(key: K, value: IDESettings[K]): void {
    this.settings[key] = value;
  }

  getAll(): IDESettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  reset(): void {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  importSettings(filePath: string): void {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      this.settings = this.deepMerge(
        JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        parsed
      );
    } catch (err) {
      throw new Error(`Failed to import settings: ${err}`);
    }
  }

  exportSettings(filePath: string): void {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.settings, null, 2), "utf-8");
    } catch (err) {
      throw new Error(`Failed to export settings: ${err}`);
    }
  }

  private deepMerge(target: any, source: any): any {
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === "object"
      ) {
        target[key] = this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
}
