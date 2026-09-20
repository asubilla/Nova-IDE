import * as fs from 'fs';
import * as path from 'path';
import { Store } from './store';
import {
  SessionRecord,
  AgentRecord,
  ResultRecord,
  ArtifactRecord,
  CheckpointRecord,
  EventRecord,
} from './schema';

const SCHEMA_VERSION_KEY = '__schema_version__';
const CURRENT_VERSION = 1;

interface Migration {
  version: number;
  up: (dataDir: string) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: (dataDir: string) => {
      const collections = [
        'sessions',
        'agents',
        'results',
        'artifacts',
        'checkpoints',
        'events',
      ];
      for (const name of collections) {
        const filePath = path.join(dataDir, `${name}.json`);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, '[]', 'utf-8');
        }
      }
    },
  },
];

export function getSchemaVersion(dataDir: string): number {
  const metaPath = path.join(dataDir, '__meta__.json');
  try {
    if (fs.existsSync(metaPath)) {
      const raw = fs.readFileSync(metaPath, 'utf-8');
      const meta = JSON.parse(raw);
      return meta.version ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function setSchemaVersion(dataDir: string, version: number): void {
  const metaPath = path.join(dataDir, '__meta__.json');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify({ version }, null, 2), 'utf-8');
}

export function migrate(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });

  let currentVersion = getSchemaVersion(dataDir);

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration v${migration.version}...`);
      migration.up(dataDir);
      currentVersion = migration.version;
      setSchemaVersion(dataDir, currentVersion);
    }
  }
}

export function ensureIndexes(_dataDir: string): void {
  // JSON stores query via predicates; indexes are conceptual here.
  // If migrating to SQLite later, create B-tree indexes on:
  //   sessions: (status, createdAt)
  //   agents: (sessionId, status, type)
  //   results: (sessionId, agentId, status)
  //   artifacts: (sessionId, agentId, type)
  //   checkpoints: (sessionId, timestamp)
  //   events: (sessionId, agentId, type, timestamp)
}

export function initializeDatabase(dataDir: string): {
  sessions: Store<SessionRecord>;
  agents: Store<AgentRecord>;
  results: Store<ResultRecord>;
  artifacts: Store<ArtifactRecord>;
  checkpoints: Store<CheckpointRecord>;
  events: Store<EventRecord>;
} {
  migrate(dataDir);
  ensureIndexes(dataDir);

  const opts = { dataDir, autoSave: true };

  return {
    sessions: new Store<SessionRecord>('sessions', opts),
    agents: new Store<AgentRecord>('agents', opts),
    results: new Store<ResultRecord>('results', opts),
    artifacts: new Store<ArtifactRecord>('artifacts', opts),
    checkpoints: new Store<CheckpointRecord>('checkpoints', opts),
    events: new Store<EventRecord>('events', opts),
  };
}
