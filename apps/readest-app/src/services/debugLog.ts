/**
 * Minimal debug logger for Android troubleshooting.
 *
 * On Android, browser console is inaccessible, so we write to a persistent
 * ring-buffer in localStorage and expose a UI overlay to inspect it.
 */

const MAX_ENTRIES = 200;

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  tag: string;
  msg: string;
  detail?: string;
}

class DebugLog {
  private entries: LogEntry[] = [];
  private storageKey = 'readest_debug_log';
  private listeners: Array<() => void> = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) this.entries = JSON.parse(raw) as LogEntry[];
    } catch {
      /* ignore */
    }
  }

  private save() {
    try {
      if (this.entries.length > MAX_ENTRIES * 2) {
        this.entries = this.entries.slice(-MAX_ENTRIES);
      }
      localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch {
      /* ignore */
    }
    this.listeners.forEach((fn) => fn());
  }

  log(tag: string, msg: string, detail?: unknown) {
    this.write('info', tag, msg, detail);
  }

  warn(tag: string, msg: string, detail?: unknown) {
    this.write('warn', tag, msg, detail);
  }

  error(tag: string, msg: string, detail?: unknown) {
    this.write('error', tag, msg, detail);
  }

  private write(level: LogLevel, tag: string, msg: string, detail?: unknown) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      tag,
      msg,
      detail:
        detail instanceof Error
          ? `${detail.message}\n${detail.stack ?? ''}`
          : detail !== undefined
            ? typeof detail === 'string'
              ? detail
              : JSON.stringify(detail, null, 2)
            : undefined,
    };
    this.entries.push(entry);
    console[level](`[${tag}] ${msg}`, detail ?? '');
    this.save();
  }

  getAll(): LogEntry[] {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
    this.save();
  }

  subscribe(fn: () => void) {
    this.listeners.push(fn);
  }

  unsubscribe(fn: () => void) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  /** Export as formatted text for sharing. */
  exportText(): string {
    return this.entries
      .map(
        (e) =>
          `${e.ts} [${e.level.toUpperCase()}] ${e.tag}: ${e.msg}${e.detail ? '\n' + e.detail : ''}`,
      )
      .join('\n');
  }

  get size(): number {
    return this.entries.length;
  }
}

export const debugLog = new DebugLog();
