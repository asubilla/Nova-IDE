import { create } from 'zustand';
import type { MCPServer, ToolExecution } from '../types/mcp-registry';

const PRELOADED_SERVERS: MCPServer[] = [
  {
    name: 'GitHub MCP',
    description: 'Manage repos, issues, PRs, and workflows via GitHub API',
    category: 'Development',
    tools: [
      { name: 'create_issue', description: 'Create a new issue', params: { repo: 'string', title: 'string', body: 'string' } },
      { name: 'list_prs', description: 'List pull requests', params: { repo: 'string' } },
      { name: 'merge_pr', description: 'Merge a pull request', params: { repo: 'string', pr_number: 'number' } },
      { name: 'search_code', description: 'Search code across repos', params: { query: 'string' } },
    ],
  },
  {
    name: 'Playwright MCP',
    description: 'Browser automation for testing and scraping',
    category: 'Testing',
    tools: [
      { name: 'navigate', description: 'Navigate to URL', params: { url: 'string' } },
      { name: 'click', description: 'Click an element', params: { selector: 'string' } },
      { name: 'screenshot', description: 'Take page screenshot', params: { path: 'string' } },
      { name: 'fill_form', description: 'Fill form fields', params: { fields: 'object' } },
    ],
  },
  {
    name: 'Supabase MCP',
    description: 'Database queries, auth, and real-time subscriptions',
    category: 'Database',
    tools: [
      { name: 'query', description: 'Run SQL query', params: { sql: 'string' } },
      { name: 'insert', description: 'Insert row', params: { table: 'string', data: 'object' } },
      { name: 'auth_sign_in', description: 'Sign in user', params: { email: 'string', password: 'string' } },
      { name: 'subscribe', description: 'Subscribe to changes', params: { table: 'string' } },
    ],
  },
  {
    name: 'Stripe MCP',
    description: 'Payment processing and subscription management',
    category: 'Payments',
    tools: [
      { name: 'create_payment', description: 'Create payment intent', params: { amount: 'number', currency: 'string' } },
      { name: 'create_customer', description: 'Create customer', params: { email: 'string', name: 'string' } },
      { name: 'list_invoices', description: 'List invoices', params: { customer: 'string' } },
      { name: 'refund', description: 'Refund a payment', params: { payment_id: 'string' } },
    ],
  },
  {
    name: 'Figma MCP',
    description: 'Read and interact with Figma design files',
    category: 'Design',
    tools: [
      { name: 'get_file', description: 'Get file data', params: { file_key: 'string' } },
      { name: 'get_components', description: 'List components', params: { file_key: 'string' } },
      { name: 'get_styles', description: 'List styles', params: { file_key: 'string' } },
      { name: 'export_images', description: 'Export node as image', params: { node_id: 'string', format: 'string' } },
    ],
  },
  {
    name: 'Slack MCP',
    description: 'Send messages and manage Slack channels',
    category: 'Communication',
    tools: [
      { name: 'send_message', description: 'Send a message', params: { channel: 'string', text: 'string' } },
      { name: 'list_channels', description: 'List channels', params: {} },
      { name: 'upload_file', description: 'Upload a file', params: { channel: 'string', file: 'string' } },
      { name: 'react', description: 'Add reaction', params: { channel: 'string', timestamp: 'string', emoji: 'string' } },
    ],
  },
  {
    name: 'Linear MCP',
    description: 'Issue tracking and project management',
    category: 'Project Management',
    tools: [
      { name: 'create_issue', description: 'Create an issue', params: { title: 'string', team: 'string' } },
      { name: 'update_issue', description: 'Update an issue', params: { id: 'string', data: 'object' } },
      { name: 'list_issues', description: 'List issues', params: { team: 'string' } },
      { name: 'add_comment', description: 'Add comment to issue', params: { id: 'string', body: 'string' } },
    ],
  },
  {
    name: 'Vercel MCP',
    description: 'Deploy and manage Vercel projects',
    category: 'Deployment',
    tools: [
      { name: 'deploy', description: 'Trigger deployment', params: { project: 'string' } },
      { name: 'list_deployments', description: 'List deployments', params: { project: 'string' } },
      { name: 'get_logs', description: 'Get deployment logs', params: { deployment_id: 'string' } },
      { name: 'set_env', description: 'Set environment variable', params: { project: 'string', key: 'string', value: 'string' } },
    ],
  },
  {
    name: 'Docker MCP',
    description: 'Manage containers, images, and compose stacks',
    category: 'DevOps',
    tools: [
      { name: 'list_containers', description: 'List containers', params: {} },
      { name: 'run_container', description: 'Run a container', params: { image: 'string', name: 'string' } },
      { name: 'logs', description: 'Get container logs', params: { container: 'string' } },
      { name: 'exec', description: 'Exec command in container', params: { container: 'string', command: 'string' } },
    ],
  },
  {
    name: 'AWS S3 MCP',
    description: 'Object storage and file management on S3',
    category: 'Cloud',
    tools: [
      { name: 'list_buckets', description: 'List S3 buckets', params: {} },
      { name: 'upload', description: 'Upload object', params: { bucket: 'string', key: 'string', body: 'binary' } },
      { name: 'download', description: 'Download object', params: { bucket: 'string', key: 'string' } },
      { name: 'delete', description: 'Delete object', params: { bucket: 'string', key: 'string' } },
    ],
  },
  {
    name: 'OpenAI MCP',
    description: 'AI completions, embeddings, and image generation',
    category: 'AI',
    tools: [
      { name: 'chat', description: 'Chat completion', params: { model: 'string', messages: 'array' } },
      { name: 'embed', description: 'Create embeddings', params: { model: 'string', input: 'string' } },
      { name: 'generate_image', description: 'Generate image', params: { prompt: 'string', size: 'string' } },
      { name: 'transcribe', description: 'Transcribe audio', params: { file: 'string', model: 'string' } },
    ],
  },
  {
    name: 'Postgres MCP',
    description: 'Direct PostgreSQL database access',
    category: 'Database',
    tools: [
      { name: 'query', description: 'Execute query', params: { sql: 'string' } },
      { name: 'schema', description: 'Get schema info', params: { table: 'string' } },
      { name: 'explain', description: 'Explain query plan', params: { sql: 'string' } },
      { name: 'backup', description: 'Create backup', params: { database: 'string' } },
    ],
  },
  {
    name: 'Notion MCP',
    description: 'Read and write Notion pages and databases',
    category: 'Productivity',
    tools: [
      { name: 'query_database', description: 'Query a database', params: { database_id: 'string', filter: 'object' } },
      { name: 'create_page', description: 'Create a page', params: { parent: 'object', properties: 'object' } },
      { name: 'update_page', description: 'Update a page', params: { page_id: 'string', properties: 'object' } },
      { name: 'get_blocks', description: 'Get page blocks', params: { page_id: 'string' } },
    ],
  },
  {
    name: 'Redis MCP',
    description: 'In-memory data store and cache management',
    category: 'Database',
    tools: [
      { name: 'get', description: 'Get value by key', params: { key: 'string' } },
      { name: 'set', description: 'Set key-value pair', params: { key: 'string', value: 'string', ttl: 'number' } },
      { name: 'publish', description: 'Publish message', params: { channel: 'string', message: 'string' } },
      { name: 'flush', description: 'Flush keys', params: { pattern: 'string' } },
    ],
  },
  {
    name: 'Sentry MCP',
    description: 'Error tracking and performance monitoring',
    category: 'Monitoring',
    tools: [
      { name: 'list_issues', description: 'List recent issues', params: { project: 'string' } },
      { name: 'get_issue', description: 'Get issue details', params: { issue_id: 'string' } },
      { name: 'resolve', description: 'Resolve an issue', params: { issue_id: 'string' } },
      { name: 'metrics', description: 'Get performance metrics', params: { project: 'string', period: 'string' } },
    ],
  },
  {
    name: 'Cloudflare MCP',
    description: 'CDN, DNS, and edge compute management',
    category: 'Cloud',
    tools: [
      { name: 'purge_cache', description: 'Purge cache', params: { zone: 'string', urls: 'array' } },
      { name: 'dns_record', description: 'Manage DNS records', params: { zone: 'string', record: 'object' } },
      { name: 'analytics', description: 'Get analytics data', params: { zone: 'string', range: 'string' } },
      { name: 'workers', description: 'Manage workers', params: { account: 'string' } },
    ],
  },
  {
    name: 'Neon MCP',
    description: 'Serverless Postgres with branching',
    category: 'Database',
    tools: [
      { name: 'create_branch', description: 'Create database branch', params: { project: 'string', name: 'string' } },
      { name: 'query', description: 'Run query on branch', params: { branch: 'string', sql: 'string' } },
      { name: 'list_branches', description: 'List branches', params: { project: 'string' } },
      { name: 'reset', description: 'Reset branch', params: { branch: 'string' } },
    ],
  },
  {
    name: 'Auth0 MCP',
    description: 'Authentication and authorization management',
    category: 'Security',
    tools: [
      { name: 'list_users', description: 'List users', params: {} },
      { name: 'create_user', description: 'Create user', params: { email: 'string', password: 'string' } },
      { name: 'assign_role', description: 'Assign role', params: { user_id: 'string', role: 'string' } },
      { name: 'revoke_token', description: 'Revoke token', params: { token: 'string' } },
    ],
  },
  {
    name: 'Resend MCP',
    description: 'Transactional email sending and templates',
    category: 'Communication',
    tools: [
      { name: 'send_email', description: 'Send email', params: { from: 'string', to: 'string', subject: 'string', html: 'string' } },
      { name: 'list_domains', description: 'List domains', params: {} },
      { name: 'create_domain', description: 'Create domain', params: { name: 'string' } },
      { name: 'batch', description: 'Batch send emails', params: { emails: 'array' } },
    ],
  },
  {
    name: 'Upstash MCP',
    description: 'Serverless Redis and Kafka',
    category: 'Database',
    tools: [
      { name: 'get', description: 'Get value', params: { key: 'string' } },
      { name: 'set', description: 'Set value', params: { key: 'string', value: 'string', ex: 'number' } },
      { name: 'incr', description: 'Increment counter', params: { key: 'string' } },
      { name: 'topic_publish', description: 'Publish to Kafka topic', params: { topic: 'string', message: 'string' } },
    ],
  },
];

interface MCPRegistryState {
  servers: MCPServer[];
  searchQuery: string;
  filteredServers: MCPServer[];
  executions: ToolExecution[];
  searchTools: (query: string) => void;
  executeTool: (serverName: string, toolName: string, input: Record<string, unknown>) => void;
}

export const useMCPRegistryStore = create<MCPRegistryState>((set, get) => ({
  servers: PRELOADED_SERVERS,
  searchQuery: '',
  filteredServers: PRELOADED_SERVERS,
  executions: [],

  searchTools: (query: string) => {
    const q = query.toLowerCase();
    set({
      searchQuery: query,
      filteredServers: q
        ? get().servers.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              s.category.toLowerCase().includes(q) ||
              s.tools.some((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
          )
        : get().servers,
    });
  },

  executeTool: (serverName: string, toolName: string, input: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    const execution: ToolExecution = {
      id,
      toolName: `${serverName}/${toolName}`,
      input,
      output: null,
      status: 'running',
      timing: { start: Date.now() },
    };
    set((s) => ({ executions: [execution, ...s.executions] }));

    setTimeout(() => {
      const success = Math.random() > 0.15;
      set((s) => ({
        executions: s.executions.map((e) =>
          e.id === id
            ? {
                ...e,
                status: success ? 'success' : 'error',
                output: success ? { result: 'Tool executed successfully', data: {} } : { error: 'Tool execution failed' },
                timing: { ...e.timing, end: Date.now(), duration: Date.now() - e.timing.start },
              }
            : e
        ),
      }));
    }, 800 + Math.random() * 2000);
  },
}));
