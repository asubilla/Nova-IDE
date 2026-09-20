# Nova Sub-Agent IDE — API Reference

## Server REST API

### Health

#### `GET /api/health`

Returns server health status.

**Response:**
```json
{
  "status": "ok",
  "uptime": 12345,
  "version": "2.0.0",
  "agents": 5,
  "sessions": 3
}
```

---

### Agents

#### `GET /api/agents`

List all registered agents.

**Response:**
```json
[
  {
    "id": "agent-001",
    "name": "code-writer",
    "status": "idle",
    "capabilities": ["typescript", "testing"],
    "created": "2025-01-15T10:00:00Z"
  }
]
```

#### `GET /api/agents/:id`

Get details for a specific agent.

**Response:**
```json
{
  "id": "agent-001",
  "name": "code-writer",
  "status": "idle",
  "capabilities": ["typescript", "testing"],
  "tasksCompleted": 42,
  "lastActive": "2025-01-15T10:30:00Z"
}
```

#### `POST /api/agents/:id/execute`

Execute a task on an agent.

**Request Body:**
```json
{
  "task": "Write unit tests for the LRUCache class",
  "context": {
    "filePath": "src/performance/lru-cache.ts"
  },
  "timeout": 60000
}
```

**Response:**
```json
{
  "taskId": "task-001",
  "status": "queued",
  "estimatedTime": 30000
}
```

#### `DELETE /api/agents/:id`

Remove a registered agent.

**Response:**
```json
{ "status": "removed" }
```

---

### Sessions

#### `POST /api/sessions`

Create a new session.

**Request Body:**
```json
{
  "projectId": "my-project",
  "agents": ["agent-001", "agent-002"],
  "config": {
    "autoCheckpoint": true
  }
}
```

**Response:**
```json
{
  "sessionId": "sess-001",
  "status": "created",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

#### `GET /api/sessions`

List all active sessions.

**Response:**
```json
[
  {
    "id": "sess-001",
    "projectId": "my-project",
    "status": "active",
    "agents": 2,
    "checkpoints": 5
  }
]
```

#### `POST /api/sessions/:id/checkpoint`

Create a checkpoint in the current session.

**Request Body:**
```json
{
  "message": "Completed feature X implementation"
}
```

**Response:**
```json
{
  "checkpointId": "cp-001",
  "message": "Completed feature X implementation",
  "created": "2025-01-15T10:15:00Z"
}
```

#### `POST /api/sessions/:id/revert/:checkpointId`

Revert the session to a specific checkpoint.

**Response:**
```json
{
  "status": "reverted",
  "checkpointId": "cp-001",
  "filesChanged": 3
}
```

#### `DELETE /api/sessions/:id`

Delete a session and all its checkpoints.

**Response:**
```json
{ "status": "deleted" }
```

---

### Chat

#### `POST /api/chat/send`

Send a chat message.

**Request Body:**
```json
{
  "sessionId": "sess-001",
  "agentId": "agent-001",
  "message": "What is the current status of the build?",
  "sensitive": false
}
```

**Response:**
```json
{
  "messageId": "msg-001",
  "timestamp": "2025-01-15T10:20:00Z"
}
```

#### `GET /api/chat/history/:sessionId`

Get chat history for a session.

**Query Parameters:**
- `limit` (number, default 50) — Max messages to return
- `offset` (number, default 0) — Pagination offset

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-001",
      "agentId": "agent-001",
      "message": "Build is passing.",
      "timestamp": "2025-01-15T10:20:05Z"
    }
  ],
  "total": 15
}
```

---

### Files

#### `POST /api/files/apply`

Apply file changes (diff-based).

**Request Body:**
```json
{
  "sessionId": "sess-001",
  "changes": [
    {
      "path": "src/utils/hash.ts",
      "action": "update",
      "diff": "--- a/src/utils/hash.ts\n+++ b/src/utils/hash.ts\n..."
    }
  ]
}
```

**Response:**
```json
{
  "status": "applied",
  "filesChanged": 1,
  "conflicts": []
}
```

---

### Extensions

#### `GET /api/extensions`

List installed extensions.

**Response:**
```json
[
  {
    "id": "ext-001",
    "name": "typescript-support",
    "version": "1.0.0",
    "status": "active"
  }
]
```

#### `POST /api/extensions/install`

Install an extension.

**Request Body:**
```json
{
  "name": "python-support",
  "source": "registry"
}
```

**Response:**
```json
{
  "id": "ext-002",
  "name": "python-support",
  "version": "1.0.0",
  "status": "installing"
}
```

---

## WebSocket Protocol

Connect to `ws://localhost:3000/ws` for real-time events.

### Client → Server

#### `subscribe`
```json
{ "type": "subscribe", "channels": ["agents", "sessions"] }
```

#### `unsubscribe`
```json
{ "type": "unsubscribe", "channels": ["agents"] }
```

#### `execute`
```json
{ "type": "execute", "agentId": "agent-001", "task": "..." }
```

### Server → Client

#### `agent:status`
```json
{ "type": "agent:status", "agentId": "agent-001", "status": "working" }
```

#### `task:progress`
```json
{ "type": "task:progress", "taskId": "task-001", "progress": 75, "message": "Writing tests..." }
```

#### `task:complete`
```json
{ "type": "task:complete", "taskId": "task-001", "result": { "filesCreated": 2 } }
```

#### `chat:message`
```json
{ "type": "chat:message", "sessionId": "sess-001", "message": "Build passed!" }
```

#### `file:change`
```json
{ "type": "file:change", "path": "src/utils/hash.ts", "action": "updated" }
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent with id 'agent-001' not found",
    "status": 404
  }
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `AGENT_NOT_FOUND` | 404 | Agent does not exist |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `TASK_TIMEOUT` | 408 | Task execution timed out |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | Authentication required |
| `SANDBOX_VIOLATION` | 403 | Operation blocked by sandbox |
| `INTERNAL_ERROR` | 500 | Internal server error |
