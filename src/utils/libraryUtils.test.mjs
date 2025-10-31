import { describe, it, expect } from 'vitest';
import { normalizePath } from './libraryUtils';

describe('normalizePath', () => {
  it('should normalize slashes and lowercase', () => {
    expect(normalizePath('C:\\Music\\Rock/Album')).toBe('c:/music/rock/album');
    expect(normalizePath('/Music/Pop/')).toBe('music/pop/');
    expect(normalizePath('')).toBe('');
    expect(normalizePath(null)).toBe('');
  });

  it('should handle already normalized paths', () => {
    expect(normalizePath('music/rock')).toBe('music/rock');
  });
});

// findFileInDir is async and requires a FileSystemDirectoryHandle mock, which is not trivial to test in Node.
// For now, we focus on normalizePath. Integration tests for findFileInDir should be added in browser/e2e.
