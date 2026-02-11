import { describe, it, expect } from 'vitest';
import {
  formatTASISymbol,
  extractTicker,
  isValidTASITicker,
  getTASIStockName,
} from '../tradingview-utils';

describe('tradingview-utils', () => {
  describe('formatTASISymbol', () => {
    it('should format plain ticker to TADAWUL format', () => {
      expect(formatTASISymbol('2222')).toBe('TADAWUL:2222');
      expect(formatTASISymbol('1120')).toBe('TADAWUL:1120');
    });

    it('should preserve already formatted symbols', () => {
      expect(formatTASISymbol('TADAWUL:2222')).toBe('TADAWUL:2222');
      expect(formatTASISymbol('tadawul:1120')).toBe('TADAWUL:1120');
    });

    it('should handle whitespace', () => {
      expect(formatTASISymbol('  2222  ')).toBe('TADAWUL:2222');
    });
  });

  describe('extractTicker', () => {
    it('should extract ticker from TADAWUL format', () => {
      expect(extractTicker('TADAWUL:2222')).toBe('2222');
      expect(extractTicker('TADAWUL:1120')).toBe('1120');
    });

    it('should return plain ticker as-is', () => {
      expect(extractTicker('2222')).toBe('2222');
      expect(extractTicker('1120')).toBe('1120');
    });
  });

  describe('isValidTASITicker', () => {
    it('should validate 4-digit tickers', () => {
      expect(isValidTASITicker('2222')).toBe(true);
      expect(isValidTASITicker('1120')).toBe(true);
      expect(isValidTASITicker('TADAWUL:2222')).toBe(true);
    });

    it('should reject invalid tickers', () => {
      expect(isValidTASITicker('222')).toBe(false);
      expect(isValidTASITicker('22222')).toBe(false);
      expect(isValidTASITicker('ABCD')).toBe(false);
      expect(isValidTASITicker('')).toBe(false);
    });
  });

  describe('getTASIStockName', () => {
    it('should return known stock names', () => {
      expect(getTASIStockName('2222')).toBe('Saudi Aramco');
      expect(getTASIStockName('1120')).toBe('Al Rajhi Bank');
      expect(getTASIStockName('TADAWUL:2010')).toBe('SABIC');
    });

    it('should return ticker for unknown stocks', () => {
      expect(getTASIStockName('9999')).toBe('9999');
      expect(getTASIStockName('TADAWUL:8888')).toBe('8888');
    });
  });
});
