/**
 * HTTP Wrapper for NotebookLM MCP Server
 *
 * Exposes the MCP server via HTTP REST API
 * Allows n8n and other tools to call the server without stdio
 */

import express, { Request, Response } from 'express';
import { AuthManager } from './auth/auth-manager.js';
import { SessionManager } from './session/session-manager.js';
import { NotebookLibrary } from './library/notebook-library.js';
import { ToolHandlers } from './tools/index.js';
import { log } from './utils/logger.js';

const app = express();
app.use(express.json());

// CORS for n8n
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
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
    const { question, session_id, notebook_id, notebook_url, show_browser } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: question'
      });
    }

    const result = await toolHandlers.handleAskQuestion(
      { question, session_id, notebook_id, notebook_url, show_browser },
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
    const { show_browser } = req.body;

    const result = await toolHandlers.handleSetupAuth(
      { show_browser },
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
    const { url, name, description, topics, content_types, use_cases, tags } = req.body;

    if (!url || !name || !description || !topics) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: url, name, description, topics'
      });
    }

    const result = await toolHandlers.handleAddNotebook({
      url, name, description, topics, content_types, use_cases, tags
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get notebook
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

// Start server
const PORT = Number(process.env.HTTP_PORT) || 3000;
const HOST = process.env.HTTP_HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  log.success(`🌐 NotebookLM MCP HTTP Server v1.2.0`);
  log.success(`   Listening on ${HOST}:${PORT}`);
  log.info('');
  log.info('📊 Quick Links:');
  log.info(`   Health check: http://localhost:${PORT}/health`);
  log.info(`   API endpoint: http://localhost:${PORT}/ask`);
  log.info('');
  log.info('📖 Available Endpoints:');
  log.info('   POST   /ask                    Ask a question to NotebookLM');
  log.info('   GET    /health                 Server health check');
  log.info('   GET    /notebooks              List all notebooks');
  log.info('   POST   /notebooks              Add a new notebook');
  log.info('   GET    /notebooks/:id          Get notebook details');
  log.info('   DELETE /notebooks/:id          Delete a notebook');
  log.info('   PUT    /notebooks/:id/activate Activate a notebook (set as default)');
  log.info('   GET    /sessions               List active sessions');
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
