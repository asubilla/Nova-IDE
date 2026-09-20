import { describe, it, expect, beforeEach } from 'vitest';
import { DiffEngine, DiffFormat, DiffLineType } from '../../src/chat/diff-engine';

describe('DiffEngine', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  // ─── Line Diff ───────────────────────────────────────────────────

  describe('computeDiff', () => {
    it('should compute line diff between two texts', () => {
      const diff = engine.computeDiff('line1\nline2\nline3', 'line1\nmodified\nline3');

      expect(diff).toBeDefined();
      expect(diff.hunks.length).toBeGreaterThan(0);
      expect(diff.stats.totalLines).toBeGreaterThan(0);
    });

    it('should handle identical strings', () => {
      const diff = engine.computeDiff('same\ncontent', 'same\ncontent');

      expect(diff.stats.addedLines).toBe(0);
      expect(diff.stats.removedLines).toBe(0);
    });

    it('should handle empty strings', () => {
      const diff = engine.computeDiff('', '');

      expect(diff.stats.addedLines).toBe(0);
      expect(diff.stats.removedLines).toBe(0);
    });

    it('should handle adding lines', () => {
      const diff = engine.computeDiff('line1', 'line1\nline2');

      expect(diff.stats.addedLines).toBe(1);
      expect(diff.stats.removedLines).toBe(0);
    });

    it('should handle removing lines', () => {
      const diff = engine.computeDiff('line1\nline2', 'line1');

      expect(diff.stats.addedLines).toBe(0);
      expect(diff.stats.removedLines).toBe(1);
    });

    it('should generate id and timestamp', () => {
      const diff = engine.computeDiff('a', 'b');

      expect(diff.id).toBeDefined();
      expect(diff.timestamp).toBeInstanceOf(Date);
    });
  });

  // ─── Word Diff ───────────────────────────────────────────────────

  describe('computeWordDiff', () => {
    it('should compute word-level diff', () => {
      const result = engine.computeWordDiff('hello world', 'hello earth');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle identical text', () => {
      const result = engine.computeWordDiff('same text', 'same text');

      expect(result.length).toBe(1);
      expect(result[0].every(seg => !seg.isChange)).toBe(true);
    });
  });

  // ─── Char Diff ───────────────────────────────────────────────────

  describe('computeCharDiff', () => {
    it('should compute character-level diff', () => {
      const result = engine.computeCharDiff('abc', 'axc');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle identical text', () => {
      const result = engine.computeCharDiff('abc', 'abc');

      expect(result.length).toBe(1);
      expect(result[0].type).toBe(DiffLineType.Unchanged);
    });
  });

  // ─── Render Side by Side ─────────────────────────────────────────

  describe('renderSideBySide', () => {
    it('should render side-by-side diff', () => {
      const result = engine.renderSideBySide('line1\nline2', 'line1\nmodified');

      expect(result).toBeDefined();
      expect(result.left).toBeDefined();
      expect(result.right).toBeDefined();
      expect(result.stats).toBeDefined();
    });
  });

  // ─── Render Inline ───────────────────────────────────────────────

  describe('renderInline', () => {
    it('should render inline diff', () => {
      const html = engine.renderInline('line1\nline2', 'line1\nmodified');

      expect(html).toContain('diff-container');
    });
  });

  // ─── Render Unified ──────────────────────────────────────────────

  describe('renderUnified', () => {
    it('should render unified diff', () => {
      const unified = engine.renderUnified('line1\nline2', 'line1\nmodified');

      expect(unified).toContain('---');
      expect(unified).toContain('+++');
    });
  });

  // ─── Apply Patch ─────────────────────────────────────────────────

  describe('applyPatch', () => {
    it('should create and apply patch with identity', () => {
      const original = 'same text';
      const patch = engine.createPatch(original, original);
      const result = engine.applyPatch(original, patch);
      expect(result).toBe(original);
    });

    it('should throw on hash mismatch', () => {
      const patch = engine.createPatch('original', 'modified');

      expect(() => engine.applyPatch('wrong-original', patch)).toThrow(
        'Patch does not match',
      );
    });

    it('should create patch with valid structure', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1\nmodified\nline3';
      const patch = engine.createPatch(original, modified);

      expect(patch.id).toBeDefined();
      expect(patch.originalHash).toBeDefined();
      expect(patch.hunks.length).toBeGreaterThan(0);
      expect(patch.timestamp).toBeDefined();
    });
  });

  // ─── Revert ──────────────────────────────────────────────────────

  describe('revertToOriginal', () => {
    it('should return original text', () => {
      const result = engine.revertToOriginal('original', engine.computeDiff('a', 'b'));
      expect(result).toBe('original');
    });
  });

  // ─── Large Diffs ─────────────────────────────────────────────────

  describe('large diffs', () => {
    it('should handle large diffs', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
      const modified = [...lines.slice(0, 50), 'new line', ...lines.slice(50)];

      const diff = engine.computeDiff(lines.join('\n'), modified.join('\n'));
      expect(diff).toBeDefined();
      expect(diff.stats.addedLines).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Get Stats ───────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return stats for diff', () => {
      const diff = engine.computeDiff('a\nb', 'a\nc\nb');
      const stats = engine.getStats(diff);

      expect(stats).toBeDefined();
      expect(stats.totalLines).toBeGreaterThan(0);
    });
  });
});
