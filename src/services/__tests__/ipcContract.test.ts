import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer/native IPC contract', () => {
  it('keeps every TauriAPI command registered in the Rust invoke handler', () => {
    const root = process.cwd();
    const api = readFileSync(resolve(root, 'src/services/TauriAPI.ts'), 'utf8');
    const main = readFileSync(resolve(root, 'src-tauri/src/main.rs'), 'utf8');
    const handlerStart = main.indexOf('tauri::generate_handler![');
    const handlerEnd = main.indexOf('])', handlerStart);
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handler = main.slice(handlerStart, handlerEnd);

    const invoked = new Set(
      [...api.matchAll(/(?:this\._invoke|invoke)(?:<[^>]+>)?\(\s*['"]([a-z0-9_]+)['"]/g)]
        .map(match => match[1]),
    );
    const registered = new Set(
      [...handler.matchAll(/^\s*([a-z][a-z0-9_]+),?\s*$/gm)].map(match => match[1]),
    );
    const missing = [...invoked].filter(command => !registered.has(command));
    expect(missing).toEqual([]);
  });
});
