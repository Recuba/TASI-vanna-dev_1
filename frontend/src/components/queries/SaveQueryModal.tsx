'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { queryStore } from '@/lib/queries/query-store';
import type { QueryRecord } from '@/types/queries';

interface SaveQueryModalProps {
  record: QueryRecord;
  onClose: () => void;
  onSaved: (updated: QueryRecord) => void;
}

export function SaveQueryModal({ record, onClose, onSaved }: SaveQueryModalProps) {
  const [name, setName] = useState(record.name || '');
  const [tagsInput, setTagsInput] = useState(record.tags.join(', '));
  const [notes, setNotes] = useState(record.notes || '');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape + focus trapping
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await queryStore.updateQuery(record.id, {
        name: name.trim() || undefined,
        tags,
        notes: notes.trim() || undefined,
        isFavorite: true,
      });
      if (updated) onSaved(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={modalRef} className="w-full max-w-md mx-4 bg-[var(--bg-card)] border gold-border rounded-xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Save Query">
        {/* Header */}
        <div className="px-5 py-3 border-b gold-border flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Save Query</h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Query preview */}
          <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] rounded p-2 truncate">
            {record.naturalLanguageQuery}
          </div>

          {/* Name */}
          <div>
            <label htmlFor="save-query-name" className="block text-xs text-[var(--text-muted)] mb-1">Name</label>
            <input
              id="save-query-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Top banks by market cap"
              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-lg placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="save-query-tags" className="block text-xs text-[var(--text-muted)] mb-1">Tags (comma separated)</label>
            <input
              id="save-query-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. banking, market cap, analysis"
              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-lg placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="save-query-notes" className="block text-xs text-[var(--text-muted)] mb-1">Notes</label>
            <textarea
              id="save-query-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this query..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-lg placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t gold-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'px-4 py-1.5 text-xs font-medium rounded-lg transition-all',
              'bg-gold text-[#0E0E0E] hover:bg-gold-light',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {saving ? 'Saving...' : 'Save & Favorite'}
          </button>
        </div>
      </div>
    </div>
  );
}
