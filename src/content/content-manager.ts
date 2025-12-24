/**
 * Content Manager
 *
 * Handles NotebookLM content operations:
 * - Source/document upload
 * - Content generation (audio, briefing, study guides, etc.)
 * - Content listing and download
 *
 * Uses Playwright to interact with NotebookLM's web interface.
 */

import type { Page } from 'patchright';
import path from 'path';
import { existsSync } from 'fs';
import { randomDelay, realisticClick } from '../utils/stealth-utils.js';
import { log } from '../utils/logger.js';
import { CONFIG } from '../config.js';
import type {
  SourceUploadInput,
  SourceUploadResult,
  ContentType,
  ContentGenerationInput,
  ContentGenerationResult,
  NotebookSource,
  GeneratedContent,
  NotebookContentOverview,
  ContentDownloadResult,
  AudioGenerationOptions,
} from './types.js';

// Note: UI selectors are defined inline in methods for better maintainability
// as NotebookLM's UI may change frequently

export class ContentManager {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ============================================================================
  // Source/Document Upload
  // ============================================================================

  /**
   * Add a source to the current notebook
   */
  async addSource(input: SourceUploadInput): Promise<SourceUploadResult> {
    log.info(`📄 Adding source: ${input.type}`);

    try {
      // Click "Add source" button
      await this.clickAddSource();

      // Wait for upload dialog
      await this.waitForUploadDialog();

      // Select upload type and upload
      switch (input.type) {
        case 'file':
          return await this.uploadFile(input);
        case 'url':
          return await this.uploadUrl(input);
        case 'text':
          return await this.uploadText(input);
        case 'google_drive':
          return await this.uploadGoogleDrive(input);
        case 'youtube':
          return await this.uploadYouTube(input);
        default:
          return { success: false, error: `Unsupported source type: ${input.type}` };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`❌ Failed to add source: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Click the "Add source" button
   */
  private async clickAddSource(): Promise<void> {
    const addSourceSelectors = [
      'button[aria-label*="Add source"]',
      'button[aria-label*="Ajouter"]',
      'button:has-text("Add source")',
      'button:has-text("Ajouter une source")',
      'button:has-text("+")',
      '.add-source-button',
    ];

    for (const selector of addSourceSelectors) {
      try {
        const button = this.page.locator(selector).first();
        if (await button.isVisible({ timeout: 1000 })) {
          log.info(`  ✅ Found add source button: ${selector}`);
          await realisticClick(this.page, selector, true);
          await randomDelay(500, 1000);
          return;
        }
      } catch {
        continue;
      }
    }

    throw new Error('Could not find "Add source" button');
  }

  /**
   * Wait for upload dialog to appear
   */
  private async waitForUploadDialog(): Promise<void> {
    const dialogSelectors = [
      '[role="dialog"]',
      '.upload-dialog',
      '.modal',
      '[data-dialog="upload"]',
    ];

    for (const selector of dialogSelectors) {
      try {
        await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
        log.info(`  ✅ Upload dialog appeared`);
        return;
      } catch {
        continue;
      }
    }

    // Dialog might not be a separate element - continue anyway
    log.info(`  ℹ️ No explicit dialog, continuing with upload...`);
  }

  /**
   * Upload a local file
   */
  private async uploadFile(input: SourceUploadInput): Promise<SourceUploadResult> {
    if (!input.filePath) {
      return { success: false, error: 'File path is required' };
    }

    if (!existsSync(input.filePath)) {
      return { success: false, error: `File not found: ${input.filePath}` };
    }

    log.info(`  📁 Uploading file: ${path.basename(input.filePath)}`);

    try {
      // Click on file upload option
      const fileTypeSelectors = [
        'button:has-text("Upload files")',
        'button:has-text("Importer des fichiers")',
        'button:has-text("Upload")',
        '[data-type="file"]',
      ];

      for (const selector of fileTypeSelectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            await randomDelay(300, 500);
            break;
          }
        } catch {
          continue;
        }
      }

      // Find file input and upload
      const fileInput = await this.page.waitForSelector('input[type="file"]', {
        state: 'attached',
        timeout: 5000,
      });

      if (!fileInput) {
        throw new Error('File input not found');
      }

      await fileInput.setInputFiles(input.filePath);
      log.info(`  ✅ File selected`);

      // Wait for upload to start
      await randomDelay(1000, 2000);

      // Click upload/confirm button
      await this.clickUploadButton();

      // Wait for processing
      const result = await this.waitForSourceProcessing(
        input.title || path.basename(input.filePath)
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `File upload failed: ${errorMsg}` };
    }
  }

  /**
   * Upload from URL
   */
  private async uploadUrl(input: SourceUploadInput): Promise<SourceUploadResult> {
    if (!input.url) {
      return { success: false, error: 'URL is required' };
    }

    log.info(`  🌐 Adding URL: ${input.url}`);

    try {
      // Click on URL/Website option
      const urlTypeSelectors = [
        'button:has-text("Website")',
        'button:has-text("Site web")',
        'button:has-text("Link")',
        'button:has-text("URL")',
        '[data-type="url"]',
      ];

      for (const selector of urlTypeSelectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            await randomDelay(300, 500);
            break;
          }
        } catch {
          continue;
        }
      }

      // Find URL input
      const urlInputSelectors = [
        'input[placeholder*="URL"]',
        'input[placeholder*="url"]',
        'input[placeholder*="http"]',
        'input[name="url"]',
        'input[type="url"]',
      ];

      let urlInput = null;
      for (const selector of urlInputSelectors) {
        try {
          urlInput = await this.page.waitForSelector(selector, { state: 'visible', timeout: 2000 });
          if (urlInput) break;
        } catch {
          continue;
        }
      }

      if (!urlInput) {
        throw new Error('URL input not found');
      }

      await urlInput.fill(input.url);
      log.info(`  ✅ URL entered`);

      await randomDelay(500, 1000);

      // Click add/upload button
      await this.clickUploadButton();

      // Wait for processing
      const result = await this.waitForSourceProcessing(input.title || input.url);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `URL upload failed: ${errorMsg}` };
    }
  }

  /**
   * Upload text content
   */
  private async uploadText(input: SourceUploadInput): Promise<SourceUploadResult> {
    if (!input.text) {
      return { success: false, error: 'Text content is required' };
    }

    log.info(`  📝 Adding text content (${input.text.length} chars)`);

    try {
      // Click on paste text option
      const textTypeSelectors = [
        'button:has-text("Paste text")',
        'button:has-text("Coller du texte")',
        'button:has-text("Copy")',
        '[data-type="text"]',
      ];

      for (const selector of textTypeSelectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            await randomDelay(300, 500);
            break;
          }
        } catch {
          continue;
        }
      }

      // Find text input
      const textInput = await this.page.waitForSelector('textarea', {
        state: 'visible',
        timeout: 5000,
      });

      if (!textInput) {
        throw new Error('Text input not found');
      }

      await textInput.fill(input.text);
      log.info(`  ✅ Text entered`);

      // Set title if provided
      if (input.title) {
        const titleInput = await this.page.$(
          'input[placeholder*="title"], input[placeholder*="Title"], input[name="title"]'
        );
        if (titleInput) {
          await titleInput.fill(input.title);
        }
      }

      await randomDelay(500, 1000);

      // Click add button
      await this.clickUploadButton();

      // Wait for processing
      const result = await this.waitForSourceProcessing(input.title || 'Pasted text');

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Text upload failed: ${errorMsg}` };
    }
  }

  /**
   * Upload from Google Drive
   */
  private async uploadGoogleDrive(input: SourceUploadInput): Promise<SourceUploadResult> {
    if (!input.url) {
      return { success: false, error: 'Google Drive URL is required' };
    }

    log.info(`  📂 Adding Google Drive source: ${input.url}`);

    // Similar to URL upload but with Google Drive specific handling
    return await this.uploadUrl({ ...input, type: 'url' });
  }

  /**
   * Upload YouTube video
   */
  private async uploadYouTube(input: SourceUploadInput): Promise<SourceUploadResult> {
    if (!input.url) {
      return { success: false, error: 'YouTube URL is required' };
    }

    log.info(`  🎬 Adding YouTube video: ${input.url}`);

    try {
      // Click on YouTube option
      const ytSelectors = ['button:has-text("YouTube")', '[data-type="youtube"]'];

      for (const selector of ytSelectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            await randomDelay(300, 500);
            break;
          }
        } catch {
          continue;
        }
      }

      // Enter YouTube URL
      const urlInput = await this.page.waitForSelector(
        'input[placeholder*="youtube" i], input[placeholder*="URL"]',
        {
          state: 'visible',
          timeout: 5000,
        }
      );

      if (!urlInput) {
        throw new Error('YouTube URL input not found');
      }

      await urlInput.fill(input.url);
      log.info(`  ✅ YouTube URL entered`);

      await randomDelay(500, 1000);

      await this.clickUploadButton();

      const result = await this.waitForSourceProcessing(input.title || 'YouTube video');

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `YouTube upload failed: ${errorMsg}` };
    }
  }

  /**
   * Click the upload/add button
   */
  private async clickUploadButton(): Promise<void> {
    const uploadBtnSelectors = [
      'button:has-text("Insert")',
      'button:has-text("Insérer")',
      'button:has-text("Add")',
      'button:has-text("Ajouter")',
      'button:has-text("Upload")',
      'button:has-text("Import")',
      'button[type="submit"]',
    ];

    for (const selector of uploadBtnSelectors) {
      try {
        const btn = this.page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          log.info(`  ✅ Clicked upload button`);
          return;
        }
      } catch {
        continue;
      }
    }

    // Try pressing Enter as fallback
    await this.page.keyboard.press('Enter');
  }

  /**
   * Wait for source to finish processing
   */
  private async waitForSourceProcessing(sourceName: string): Promise<SourceUploadResult> {
    log.info(`  ⏳ Waiting for source processing: ${sourceName}`);

    const timeout = 60000; // 1 minute
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for errors
      const errorEl = await this.page.$('.error-message, [role="alert"]:has-text("error")');
      if (errorEl) {
        const errorText = await errorEl.textContent();
        return { success: false, error: errorText || 'Upload failed', status: 'failed' };
      }

      // Check for success indicators
      const successIndicators = [
        `.source-item:has-text("${sourceName}")`,
        '[data-status="ready"]',
        '.source-ready',
      ];

      for (const selector of successIndicators) {
        try {
          const el = await this.page.$(selector);
          if (el) {
            log.success(`  ✅ Source added successfully: ${sourceName}`);
            return { success: true, sourceName, status: 'ready' };
          }
        } catch {
          continue;
        }
      }

      // Check if still processing
      const processing = await this.page.$(
        '.source-processing, [data-status="processing"], .loading'
      );
      if (processing) {
        log.info(`  ⏳ Still processing...`);
      }

      await this.page.waitForTimeout(2000);
    }

    // Assume success if no error and dialog closed
    const dialogOpen = await this.page.$('[role="dialog"]:visible');
    if (!dialogOpen) {
      return { success: true, sourceName, status: 'processing' };
    }

    return { success: false, error: 'Timeout waiting for source processing', status: 'failed' };
  }

  // ============================================================================
  // Content Generation
  // ============================================================================

  /**
   * Generate content (audio, briefing, study guide, etc.)
   */
  async generateContent(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    log.info(`🎨 Generating content: ${input.type}`);

    try {
      switch (input.type) {
        case 'audio_overview':
          return await this.generateAudioOverview(input);
        case 'briefing_doc':
          return await this.generateBriefingDoc(input);
        case 'study_guide':
          return await this.generateStudyGuide(input);
        case 'timeline':
          return await this.generateTimeline(input);
        case 'faq':
          return await this.generateFAQ(input);
        case 'table_of_contents':
          return await this.generateTOC(input);
        default:
          return {
            success: false,
            contentType: input.type,
            error: `Unsupported content type: ${input.type}`,
          };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`❌ Content generation failed: ${errorMsg}`);
      return { success: false, contentType: input.type, error: errorMsg };
    }
  }

  /**
   * Generate Audio Overview (podcast)
   */
  async generateAudioOverview(
    input: ContentGenerationInput,
    options?: AudioGenerationOptions
  ): Promise<ContentGenerationResult> {
    log.info(`🎙️ Generating Audio Overview...`);

    try {
      // Navigate to Studio/Audio Overview section
      await this.navigateToStudio();

      // Look for Audio Overview button
      const audioSelectors = [
        'button:has-text("Audio Overview")',
        'button:has-text("Aperçu audio")',
        'button:has-text("Generate audio")',
        'button:has-text("Générer l\'audio")',
        '.audio-overview-button',
        '[data-action="generate-audio"]',
      ];

      let audioButton = null;
      for (const selector of audioSelectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 2000 })) {
            audioButton = btn;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!audioButton) {
        // Check if audio already exists
        const existingAudio = await this.page.$('audio, .audio-player');
        if (existingAudio) {
          log.info(`  ℹ️ Audio Overview already exists`);
          return {
            success: true,
            contentType: 'audio_overview',
            status: 'ready',
          };
        }
        throw new Error('Audio Overview button not found');
      }

      // Add custom instructions if provided
      if (options?.customInstructions || input.customInstructions) {
        const instructions = options?.customInstructions || input.customInstructions;
        await this.addCustomInstructions(instructions!);
      }

      // Click generate
      await audioButton.click();
      log.info(`  ✅ Started audio generation`);

      // Wait for generation to complete
      const result = await this.waitForAudioGeneration();

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, contentType: 'audio_overview', error: errorMsg };
    }
  }

  /**
   * Generate Briefing Document
   */
  private async generateBriefingDoc(
    input: ContentGenerationInput
  ): Promise<ContentGenerationResult> {
    return await this.generateDocumentContent(
      'briefing_doc',
      [
        'button:has-text("Briefing doc")',
        'button:has-text("Document de briefing")',
        '[data-action="generate-briefing"]',
      ],
      input
    );
  }

  /**
   * Generate Study Guide
   */
  private async generateStudyGuide(
    input: ContentGenerationInput
  ): Promise<ContentGenerationResult> {
    return await this.generateDocumentContent(
      'study_guide',
      [
        'button:has-text("Study guide")',
        'button:has-text("Guide d\'étude")',
        'button:has-text("Fiche d\'apprentissage")',
        '[data-action="generate-study-guide"]',
      ],
      input
    );
  }

  /**
   * Generate Timeline
   */
  private async generateTimeline(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    return await this.generateDocumentContent(
      'timeline',
      [
        'button:has-text("Timeline")',
        'button:has-text("Chronologie")',
        '[data-action="generate-timeline"]',
      ],
      input
    );
  }

  /**
   * Generate FAQ
   */
  private async generateFAQ(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    return await this.generateDocumentContent(
      'faq',
      ['button:has-text("FAQ")', '[data-action="generate-faq"]'],
      input
    );
  }

  /**
   * Generate Table of Contents
   */
  private async generateTOC(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    return await this.generateDocumentContent(
      'table_of_contents',
      [
        'button:has-text("Table of contents")',
        'button:has-text("Sommaire")',
        '[data-action="generate-toc"]',
      ],
      input
    );
  }

  /**
   * Generic document content generation
   */
  private async generateDocumentContent(
    contentType: ContentType,
    selectors: string[],
    input: ContentGenerationInput
  ): Promise<ContentGenerationResult> {
    log.info(`📝 Generating ${contentType}...`);

    try {
      await this.navigateToStudio();

      let button = null;
      for (const selector of selectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 2000 })) {
            button = btn;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!button) {
        throw new Error(`${contentType} button not found`);
      }

      // Add custom instructions if provided
      if (input.customInstructions) {
        await this.addCustomInstructions(input.customInstructions);
      }

      await button.click();
      log.info(`  ✅ Started ${contentType} generation`);

      // Wait for generation
      const result = await this.waitForDocumentGeneration(contentType);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, contentType, error: errorMsg };
    }
  }

  /**
   * Navigate to Studio panel
   */
  private async navigateToStudio(): Promise<void> {
    const studioSelectors = [
      '[data-tab="studio"]',
      'button:has-text("Studio")',
      '.studio-tab',
      '.notebook-guide',
    ];

    for (const selector of studioSelectors) {
      try {
        const el = this.page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 })) {
          // Check if it's a tab that needs clicking
          const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
          if (tagName === 'button' || (await el.getAttribute('role')) === 'tab') {
            await el.click();
            await randomDelay(500, 1000);
          }
          log.info(`  ✅ Studio panel accessed`);
          return;
        }
      } catch {
        continue;
      }
    }

    // Studio might already be visible
    log.info(`  ℹ️ Studio panel may already be active`);
  }

  /**
   * Add custom instructions for content generation
   */
  private async addCustomInstructions(instructions: string): Promise<void> {
    const instructionSelectors = [
      'textarea[placeholder*="instruction"]',
      'textarea[placeholder*="focus"]',
      'textarea[placeholder*="custom"]',
      '.custom-instructions textarea',
    ];

    for (const selector of instructionSelectors) {
      try {
        const textarea = await this.page.$(selector);
        if (textarea && (await textarea.isVisible())) {
          await textarea.fill(instructions);
          log.info(`  ✅ Custom instructions added`);
          return;
        }
      } catch {
        continue;
      }
    }
  }

  /**
   * Wait for audio generation to complete
   */
  private async waitForAudioGeneration(): Promise<ContentGenerationResult> {
    log.info(`  ⏳ Waiting for audio generation (this may take several minutes)...`);

    const timeout = 600000; // 10 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for errors
      const errorEl = await this.page.$('.error-message, [role="alert"]:has-text("error")');
      if (errorEl) {
        const errorText = await errorEl.textContent();
        return {
          success: false,
          contentType: 'audio_overview',
          error: errorText || 'Audio generation failed',
          status: 'failed',
        };
      }

      // Check for audio player (generation complete)
      const audioPlayer = await this.page.$(
        'audio, .audio-player, [data-component="audio-player"]'
      );
      if (audioPlayer) {
        log.success(`  ✅ Audio Overview generated!`);
        return { success: true, contentType: 'audio_overview', status: 'ready' };
      }

      // Check progress
      const progressEl = await this.page.$('[role="progressbar"], .progress-bar');
      if (progressEl) {
        const progress = await progressEl.getAttribute('aria-valuenow');
        if (progress) {
          log.info(`  ⏳ Generation progress: ${progress}%`);
        }
      }

      await this.page.waitForTimeout(5000);
    }

    return {
      success: false,
      contentType: 'audio_overview',
      error: 'Timeout waiting for audio generation',
      status: 'failed',
    };
  }

  /**
   * Wait for document generation to complete
   */
  private async waitForDocumentGeneration(
    contentType: ContentType
  ): Promise<ContentGenerationResult> {
    log.info(`  ⏳ Waiting for ${contentType} generation...`);

    const timeout = 120000; // 2 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for errors
      const errorEl = await this.page.$('.error-message, [role="alert"]:has-text("error")');
      if (errorEl) {
        const errorText = await errorEl.textContent();
        return {
          success: false,
          contentType,
          error: errorText || 'Generation failed',
          status: 'failed',
        };
      }

      // Check for generated content
      const contentSelectors = [
        '.generated-content',
        '.output-content',
        '[data-generated="true"]',
        '.note-content',
      ];

      for (const selector of contentSelectors) {
        try {
          const el = await this.page.$(selector);
          if (el) {
            const content = await el.textContent();
            if (content && content.length > 100) {
              log.success(`  ✅ ${contentType} generated!`);
              return { success: true, contentType, status: 'ready', textContent: content };
            }
          }
        } catch {
          continue;
        }
      }

      // Check if loading
      const loading = await this.page.$('.loading, .spinner, [aria-busy="true"]');
      if (!loading) {
        // No loading indicator and no content - might have completed
        await this.page.waitForTimeout(2000);
        continue;
      }

      await this.page.waitForTimeout(2000);
    }

    return {
      success: false,
      contentType,
      error: 'Timeout waiting for generation',
      status: 'failed',
    };
  }

  // ============================================================================
  // Content Listing & Download
  // ============================================================================

  /**
   * Get overview of notebook content (sources and generated content)
   */
  async getContentOverview(): Promise<NotebookContentOverview> {
    log.info(`📋 Getting notebook content overview...`);

    const sources = await this.listSources();
    const generatedContent = await this.listGeneratedContent();

    const hasAudioOverview = generatedContent.some((c) => c.type === 'audio_overview');

    return {
      sources,
      generatedContent,
      sourceCount: sources.length,
      hasAudioOverview,
    };
  }

  /**
   * List all sources in the notebook
   */
  async listSources(): Promise<NotebookSource[]> {
    const sources: NotebookSource[] = [];

    try {
      const sourceElements = await this.page.$$(
        '.source-item, [data-item="source"], .sources-list-item'
      );

      for (const el of sourceElements) {
        try {
          const name = await el.$eval(
            '.source-name, .title',
            (e) => e.textContent?.trim() || 'Unknown'
          );
          const id = (await el.getAttribute('data-id')) || `source-${sources.length}`;

          sources.push({
            id,
            name,
            type: 'document',
            status: 'ready',
          });
        } catch {
          continue;
        }
      }
    } catch (error) {
      log.warning(`  ⚠️ Could not list sources: ${error}`);
    }

    return sources;
  }

  /**
   * List all generated content
   */
  async listGeneratedContent(): Promise<GeneratedContent[]> {
    const content: GeneratedContent[] = [];

    try {
      // Check for audio overview
      const audioPlayer = await this.page.$('audio, .audio-player');
      if (audioPlayer) {
        content.push({
          id: 'audio-overview',
          type: 'audio_overview',
          name: 'Audio Overview',
          status: 'ready',
          createdAt: new Date().toISOString(),
        });
      }

      // Check for generated notes/documents
      const noteElements = await this.page.$$('.generated-note, .studio-output, .saved-note');
      for (const el of noteElements) {
        try {
          const name = await el.$eval(
            '.note-title, .title',
            (e) => e.textContent?.trim() || 'Generated Note'
          );
          const id = (await el.getAttribute('data-id')) || `note-${content.length}`;

          content.push({
            id,
            type: 'briefing_doc',
            name,
            status: 'ready',
            createdAt: new Date().toISOString(),
          });
        } catch {
          continue;
        }
      }
    } catch (error) {
      log.warning(`  ⚠️ Could not list generated content: ${error}`);
    }

    return content;
  }

  /**
   * Download audio content
   */
  async downloadAudio(outputPath?: string): Promise<ContentDownloadResult> {
    log.info(`📥 Downloading audio...`);

    try {
      // Find download button
      const downloadSelectors = [
        'button[aria-label*="Download"]',
        'button:has-text("Download")',
        'button:has-text("Télécharger")',
        'a[download]',
        '.download-button',
      ];

      let downloadBtn = null;
      for (const selector of downloadSelectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            downloadBtn = btn;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!downloadBtn) {
        // Try to get audio source directly
        const audioEl = await this.page.$('audio');
        if (audioEl) {
          const src = await audioEl.getAttribute('src');
          if (src) {
            log.info(`  ℹ️ Audio source URL: ${src}`);
            return {
              success: true,
              filePath: src,
              mimeType: 'audio/wav',
            };
          }
        }
        throw new Error('Download button not found');
      }

      // Set up download handling
      const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 });

      await downloadBtn.click();

      const download = await downloadPromise;
      const suggestedName = download.suggestedFilename();

      const savePath = outputPath || path.join(CONFIG.dataDir, suggestedName);
      await download.saveAs(savePath);

      log.success(`  ✅ Audio downloaded: ${savePath}`);

      return {
        success: true,
        filePath: savePath,
        mimeType: 'audio/wav',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Download failed: ${errorMsg}` };
    }
  }
}
