/**
 * NotebookLM MCP - Internationalization (i18n) System
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/logger.js';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= TYPES =================

export interface LocaleData {
  locale: string;
  name: string;
  description: string;
  tabs: Record<string, string>;
  buttons: Record<string, string>;
  sourceTypes: Record<string, string>;
  placeholders: Record<string, string>;
  sourceNames: Record<string, string>;
  contentTypes: Record<string, string>;
  contentOptions: Record<string, Record<string, string>>;
  dialogs: Record<string, string>;
  actions: Record<string, string>;
  status: Record<string, string>;
  errors: Record<string, string>;
}

export type SupportedLocale = 'fr' | 'en';

const DEFAULT_LOCALE: SupportedLocale = 'fr';

const localeCache: Map<string, LocaleData> = new Map();
let currentLocale: SupportedLocale = DEFAULT_LOCALE;

// ================= PATH RESOLUTION =================

function directoryHasLocales(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'fr.json')) &&
    fs.existsSync(path.join(dir, 'en.json'))
  );
}

/**
 * Resolve i18n directory safely in production & development
 */
function getI18nDir(): string {
  const candidates = [
    __dirname, // dist/i18n
    path.join(process.cwd(), 'dist', 'i18n'),
    path.join(process.cwd(), 'src', 'i18n'),
  ];

  for (const dir of candidates) {
    if (directoryHasLocales(dir)) {
      return dir;
    }
  }

  throw new Error(
    `Could not find i18n locale files. Checked: ${candidates.join(', ')}`
  );
}

// ================= LOADING =================

function loadLocale(locale: string): LocaleData {
  if (localeCache.has(locale)) {
    return localeCache.get(locale)!;
  }

  const i18nDir = getI18nDir();
  const localePath = path.join(i18nDir, `${locale}.json`);

  if (!fs.existsSync(localePath)) {
    log.warning(
      `Locale file not found: ${localePath}, falling back to ${DEFAULT_LOCALE}`
    );
    if (locale !== DEFAULT_LOCALE) {
      return loadLocale(DEFAULT_LOCALE);
    }
    throw new Error(`Default locale file not found: ${localePath}`);
  }

  try {
    const content = fs.readFileSync(localePath, 'utf-8');
    const data = JSON.parse(content) as LocaleData;
    localeCache.set(locale, data);
    log.info(`📖 Loaded locale: ${locale} (${data.name})`);
    return data;
  } catch (error) {
    log.error(`Failed to load locale ${locale}: ${error}`);
    if (locale !== DEFAULT_LOCALE) {
      return loadLocale(DEFAULT_LOCALE);
    }
    throw error;
  }
}

// ================= PUBLIC API =================

export function setLocale(locale: SupportedLocale): void {
  currentLocale = locale;
  loadLocale(locale);
  log.info(`🌐 Locale set to: ${locale}`);
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function getLocaleData(): LocaleData {
  return loadLocale(currentLocale);
}

export function getSupportedLocales(): SupportedLocale[] {
  return ['fr', 'en'];
}

export function isLocaleSupported(locale: string): locale is SupportedLocale {
  return getSupportedLocales().includes(locale as SupportedLocale);
}

// ================= SELECTOR BUILDER =================

export class SelectorBuilder {
  private selectors: string[] = [];

  buttonWithText(textKey: string): this {
    for (const locale of getSupportedLocales()) {
      const data = loadLocale(locale);
      if (data.buttons[textKey]) {
        this.selectors.push(`button:has-text("${data.buttons[textKey]}")`);
      }
    }
    return this;
  }

  tabWithText(textKey: string): this {
    for (const locale of getSupportedLocales()) {
      const data = loadLocale(locale);
      if (data.tabs[textKey]) {
        const text = data.tabs[textKey];
        this.selectors.push(`div.mdc-tab:has-text("${text}")`);
        this.selectors.push(`.mat-mdc-tab:has-text("${text}")`);
        this.selectors.push(`[role="tab"]:has-text("${text}")`);
      }
    }
    return this;
  }

  hasText(category: keyof LocaleData, key: string): this {
    for (const locale of getSupportedLocales()) {
      const data = loadLocale(locale);
      const categoryData = data[category] as Record<string, string>;
      if (categoryData?.[key]) {
        this.selectors.push(`:has-text("${categoryData[key]}")`);
      }
    }
    return this;
  }

  custom(selector: string): this {
    this.selectors.push(selector);
    return this;
  }

  build(): string[] {
    return [...new Set(this.selectors)];
  }

  buildCombined(): string {
    return this.build().join(', ');
  }
}

export function selectors(): SelectorBuilder {
  return new SelectorBuilder();
}

// ================= TRANSLATION HELPERS =================

export function t(category: keyof LocaleData, key: string): string {
  const data = getLocaleData();
  const categoryData = data[category] as Record<string, unknown>;

  if (categoryData && typeof categoryData[key] === 'string') {
    return categoryData[key] as string;
  }

  log.warning(`Translation not found: ${String(category)}.${key}`);
  return key;
}

export function tAll(category: keyof LocaleData, key: string): string[] {
  const results: string[] = [];

  for (const locale of getSupportedLocales()) {
    const data = loadLocale(locale);
    const categoryData = data[category] as Record<string, unknown>;

    if (categoryData && typeof categoryData[key] === 'string') {
      results.push(categoryData[key] as string);
    }
  }

  return [...new Set(results)];
}

// ================= INIT =================

loadLocale(DEFAULT_LOCALE);

export default {
  setLocale,
  getLocale,
  getLocaleData,
  getSupportedLocales,
  isLocaleSupported,
  selectors,
  t,
  tAll,
};
