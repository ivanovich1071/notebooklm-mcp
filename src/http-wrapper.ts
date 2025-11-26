/**
 * HTTP Wrapper for NotebookLM MCP Server
 *
 * Exposes the MCP server via HTTP REST API
 * Allows n8n and other tools to call the server without stdio
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { AuthManager } from './auth/auth-manager.js';
import { SessionManager } from './session/session-manager.js';
import { NotebookLibrary } from './library/notebook-library.js';
import { ToolHandlers } from './tools/index.js';
import { AutoDiscovery } from './auto-discovery/auto-discovery.js';
import { log } from './utils/logger.js';

// ============================================================================
// Request Validation Schemas (Zod)
// ============================================================================

const AskQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  session_id: z.string().optional(),
  notebook_id: z.string().optional(),
  notebook_url: z.string().url().optional(),
  show_browser: z.boolean().optional(),
});

const AddNotebookSchema = z.object({
  url: z.string().url().refine(
    (url) => url.includes('notebooklm.google.com'),
    'Must be a NotebookLM URL (notebooklm.google.com)'
  ),
  name: z.string().min(1, 'Name cannot be empty'),
  description: z.string().min(1, 'Description cannot be empty'),
  topics: z.array(z.string()).min(1, 'At least one topic required'),
  content_types: z.array(z.string()).optional(),
  use_cases: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateNotebookSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  topics: z.array(z.string()).optional(),
  content_types: z.array(z.string()).optional(),
  use_cases: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const AutoDiscoverSchema = z.object({
  url: z.string().url().refine(
    (url) => url.includes('notebooklm.google.com'),
    'Must be a NotebookLM URL (notebooklm.google.com)'
  ),
});

const CleanupDataSchema = z.object({
  confirm: z.boolean(),
  preserve_library: z.boolean().optional(),
});

const ShowBrowserSchema = z.object({
  show_browser: z.boolean().optional(),
});

/**
 * Validate request body against a Zod schema
 * Returns parsed data on success, sends error response on failure
 */
function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
  res: Response,
  endpoint: string
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    log.warning(`[HTTP] Validation error ${endpoint}: ${errors}`);
    res.status(400).json({
      success: false,
      error: `Validation error: ${errors}`,
    });
    return null;
  }
  return result.data;
}

const app = express();
app.use(express.json());

// CORS configuration - configurable via environment variable
// Default: localhost only. Set CORS_ORIGINS to comma-separated list for production
const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim());
  }
  // Default: allow localhost on common ports
  return [
    'http://localhost:3000',
    'http://localhost:5678', // n8n default port
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5678',
    'http://127.0.0.1:8080',
  ];
};

const allowedOrigins = getAllowedOrigins();
const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // Allow requests without origin (same-origin, curl, etc.)
  // Allow all origins if wildcard is explicitly configured
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
};

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  } else {
    log.warning(`[CORS] Blocked request from origin: ${origin}`);
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize managers
const authManager = new AuthManager();
const sessionManager = new SessionManager(authManager);
const library = new NotebookLibrary(sessionManager);
const toolHandlers = new ToolHandlers(sessionManager, authManager, library);

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleGetHealth();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Ask question
app.post('/ask', async (req: Request, res: Response) => {
  try {
    const validated = validateBody(AskQuestionSchema, req.body, res, 'POST /ask');
    if (!validated) return;

    const result = await toolHandlers.handleAskQuestion(
      validated,
      async (message, progress, total) => {
        log.info(`Progress: ${message} (${progress}/${total})`);
      }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Setup auth
app.post('/setup-auth', async (req: Request, res: Response) => {
  try {
    const validated = validateBody(ShowBrowserSchema, req.body, res, 'POST /setup-auth');
    if (!validated) return;

    const result = await toolHandlers.handleSetupAuth(
      validated,
      async (message, progress, total) => {
        log.info(`Progress: ${message} (${progress}/${total})`);
      }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// De-authenticate (logout)
app.post('/de-auth', async (_req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleDeAuth();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Re-authenticate
app.post('/re-auth', async (req: Request, res: Response) => {
  try {
    const validated = validateBody(ShowBrowserSchema, req.body, res, 'POST /re-auth');
    if (!validated) return;

    const result = await toolHandlers.handleReAuth(
      validated,
      async (message, progress, total) => {
        log.info(`Progress: ${message} (${progress}/${total})`);
      }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Cleanup data
app.post('/cleanup-data', async (req: Request, res: Response) => {
  try {
    const validated = validateBody(CleanupDataSchema, req.body, res, 'POST /cleanup-data');
    if (!validated) return;

    const result = await toolHandlers.handleCleanupData(validated);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// List notebooks
app.get('/notebooks', async (_req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleListNotebooks();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Add notebook
app.post('/notebooks', async (req: Request, res: Response) => {
  try {
    const validated = validateBody(AddNotebookSchema, req.body, res, 'POST /notebooks');
    if (!validated) return;

    const result = await toolHandlers.handleAddNotebook(validated);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// IMPORTANT: Static routes MUST come BEFORE parameterized routes!
// Otherwise /notebooks/search would match as /notebooks/:id with id="search"

// Search notebooks
app.get('/notebooks/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      log.warning('[HTTP] Bad request GET /notebooks/search: Missing query parameter');
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: query'
      });
    }
    const result = await toolHandlers.handleSearchNotebooks({
      query: query
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get library stats
app.get('/notebooks/stats', async (_req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleGetLibraryStats();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get notebook by ID (MUST come AFTER static routes like /search and /stats)
app.get('/notebooks/:id', async (req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleGetNotebook({ id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Update notebook
app.put('/notebooks/:id', async (req: Request, res: Response) => {
  try {
    const validated = validateBody(UpdateNotebookSchema, req.body, res, 'PUT /notebooks/:id');
    if (!validated) return;

    const result = await toolHandlers.handleUpdateNotebook({
      id: req.params.id,
      ...validated
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Delete notebook
app.delete('/notebooks/:id', async (req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleRemoveNotebook({ id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Auto-discover notebook metadata
app.post('/notebooks/auto-discover', async (req: Request, res: Response) => {
  try {
    const validated = validateBody(AutoDiscoverSchema, req.body, res, 'POST /notebooks/auto-discover');
    if (!validated) return;

    // Create AutoDiscovery instance and discover metadata
    const autoDiscovery = new AutoDiscovery(sessionManager);

    let metadata;
    try {
      metadata = await autoDiscovery.discoverMetadata(validated.url);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: `Failed to discover metadata: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    // Transform metadata to NotebookLibrary format
    // - tags → topics (rename field)
    // - Add default content_types
    // - Add default use_cases based on first few tags
    const notebookInput = {
      url: validated.url,
      name: metadata.name,
      description: metadata.description,
      topics: metadata.tags, // tags → topics
      content_types: ['documentation'],
      use_cases: metadata.tags.slice(0, 3), // Use first 3 tags as use cases
      auto_generated: true
    };

    // Add notebook to library
    let notebook;
    try {
      notebook = await library.addNotebook(notebookInput);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: `Failed to add notebook to library: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    // Return success with created notebook
    res.json({
      success: true,
      notebook
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Activate notebook (set as active)
app.put('/notebooks/:id/activate', async (req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleSelectNotebook({ id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// List sessions
app.get('/sessions', async (_req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleListSessions();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Close session
app.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleCloseSession({ session_id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Reset session
app.post('/sessions/:id/reset', async (req: Request, res: Response) => {
  try {
    const result = await toolHandlers.handleResetSession({ session_id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Start server
const PORT = Number(process.env.HTTP_PORT) || 3000;
const HOST = process.env.HTTP_HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  log.success(`🌐 NotebookLM MCP HTTP Server v1.3.3`);
  log.success(`   Listening on ${HOST}:${PORT}`);
  log.info('');
  log.info('📊 Quick Links:');
  log.info(`   Health check: http://localhost:${PORT}/health`);
  log.info(`   API endpoint: http://localhost:${PORT}/ask`);
  log.info('');
  log.info('📖 Available Endpoints:');
  log.info('   Authentication:');
  log.info('   POST   /setup-auth             First-time authentication');
  log.info('   POST   /de-auth                Logout (clear credentials)');
  log.info('   POST   /re-auth                Re-authenticate / switch account');
  log.info('   POST   /cleanup-data           Clean all data (requires confirm)');
  log.info('');
  log.info('   Queries:');
  log.info('   POST   /ask                    Ask a question to NotebookLM');
  log.info('   GET    /health                 Server health check');
  log.info('');
  log.info('   Notebooks:');
  log.info('   GET    /notebooks              List all notebooks');
  log.info('   POST   /notebooks              Add a new notebook');
  log.info('   POST   /notebooks/auto-discover Auto-discover notebook metadata');
  log.info('   GET    /notebooks/search       Search notebooks by query');
  log.info('   GET    /notebooks/stats        Get library statistics');
  log.info('   GET    /notebooks/:id          Get notebook details');
  log.info('   PUT    /notebooks/:id          Update notebook metadata');
  log.info('   DELETE /notebooks/:id          Delete a notebook');
  log.info('   PUT    /notebooks/:id/activate Activate a notebook (set as default)');
  log.info('');
  log.info('   Sessions:');
  log.info('   GET    /sessions               List active sessions');
  log.info('   POST   /sessions/:id/reset     Reset session history');
  log.info('   DELETE /sessions/:id           Close a session');
  log.info('');
  log.info('💡 Configuration:');
  log.info(`   Host: ${HOST} ${HOST === '0.0.0.0' ? '(accessible from network)' : '(localhost only)'}`);
  log.info(`   Port: ${PORT}`);
  log.info('');
  log.dim('📖 Documentation: ./deployment/docs/');
  log.dim('⏹️  Press Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down gracefully...');
  await toolHandlers.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down gracefully...');
  await toolHandlers.cleanup();
  process.exit(0);
});
