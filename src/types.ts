// src/types.ts

/**
 * Global type definitions for NotebookLM MCP Server
 */

/**
 * Source format options for citation display
 */
export type SourceFormat =
  | 'none' // No source extraction (default, fastest)
  | 'inline' // Insert source text inline: "text [1: source excerpt]"
  | 'footnotes' // Append sources at the end as footnotes
  | 'json' // Return sources as separate JSON object
  | 'expanded'; // Replace [1] with full quoted source text

/**
 * Extracted citation data
 */
export interface Citation {
  /** Citation marker (e.g., "[1]", "[2]") */
  marker: string;
  /** Citation number */
  number: number;
  /** Source text from hover tooltip */
  sourceText: string;
  /** Source name/title if available */
  sourceName?: string;
}

/**
 * Session information returned by the API
 * Matches the structure from session store / manager
 */
export interface SessionInfo {
  id: string;
  created_at: number; // Unix timestamp (ms)
  last_activity: number; // Unix timestamp (ms)
  age_seconds: number;
  inactive_seconds: number;
  message_count: number;
  notebook_url: string; // Full URL to the notebook
}

/**
 * Source citations data
 */
export interface SourceCitations {
  /** Format used for extraction */
  format: SourceFormat;
  /** List of extracted citations */
  citations: Citation[];
  /** Whether extraction was successful */
  extraction_success: boolean;
  /** Error message if extraction failed */
  extraction_error?: string;
}

/**
 * Session info included in successful responses (subset of SessionInfo)
 * Used specifically in AskQuestionSuccess.
 */
export interface AskSessionInfo {
  age_seconds: number;
  message_count: number;
  last_activity: number;
}

/**
 * Successful question result
 * Includes session info and optional sources if format is not 'none'.
 */
export interface AskQuestionSuccess {
  status: 'success';
  question: string;
  answer: string;
  notebook_url: string; // Full URL to the notebook where question was asked
  session_id: string; // ID of the session used
  session_info: AskSessionInfo; // Basic session metrics
  /** Extracted source citations (when source_format is not 'none') */
  sources?: SourceCitations;
}

/**
 * Error question result
 */
export interface AskQuestionError {
  status: 'error';
  question: string;
  error: string;
  notebook_url: string; // Might be included if error occurs after notebook resolution
}

/**
 * Result from asking a question (discriminated union)
 * Use `result.status` to discriminate between success and error
 */
export type AskQuestionResult = AskQuestionSuccess | AskQuestionError;

/**
 * Tool call result for MCP (generic wrapper for tool responses)
 * Defines the standard shape for MCP tool results.
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * JSON Schema property definition
 * Used for generating MCP tool schemas.
 */
export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: readonly string[];
  items?: JsonSchemaProperty | { type: string };
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
}

/**
 * MCP Tool definition
 * Structure for defining MCP tools exposed by the server.
 */
export interface Tool {
  name: string;
  title?: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[]; // Optional in JSON Schema, but often useful
  };
}

/**
 * Options for human-like typing simulation
 * Used in playwright interactions.
 */
export interface TypingOptions {
  wpm?: number; // Words per minute
  withTypos?: boolean;
}

/**
 * Options for waiting for answers from NotebookLM
 * Used in polling mechanisms.
 */
export interface WaitForAnswerOptions {
  question?: string; // Associated question for context
  timeoutMs?: number; // Max time to wait
  pollIntervalMs?: number; // Interval between polls
  ignoreTexts?: string[]; // Texts to ignore during polling
  debug?: boolean; // Enable debug logging
}

/**
 * Progress callback function for MCP progress notifications
 * Asynchronous function to report progress during long-running operations.
 */
export type ProgressCallback = (
  message: string,
  progress?: number, // Current progress count
  total?: number // Total expected count
) => Promise<void>;

// --- NEW TYPES ADDED FOR COMPLETENESS ---

/**
 * Result for adding a source
 */
export interface AddSourceResult {
  success: boolean;
  source_id?: string;
  title?: string;
  error?: string;
}

/**
 * Item representing a source in a list
 */
export interface SourceListItem {
  id: string;
  title: string;
  type: 'pdf' | 'docx' | 'txt' | 'url' | 'youtube' | 'drive';
  added_at: number; // Unix timestamp (ms)
}

/**
 * Result for listing sources
 */
export interface ListSourcesResult {
  sources: SourceListItem[];
}

// --- END NEW TYPES ---

/**
 * Global state for the server (legacy - prefer direct imports)
 * @deprecated Use direct imports of SessionManager and AuthManager instead
 * Kept for backward compatibility if referenced elsewhere.
 */
export interface ServerState {
  playwright: unknown; // Playwright instance
  sessionManager: unknown; // SessionManager instance
  authManager: unknown; // AuthManager instance
}
