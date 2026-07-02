'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Shield } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { assignRole, removeRole } from '@/services/moderationService';

interface UserPopoverProps {
  memberId: string;
  username: string;
  communityId: number;
  currentRole?: string;
  canManageRoles: boolean;
  anchorRect: DOMRect;
  onClose: () => void;
  onRoleChanged?: (memberId: string, newRole: string | null) => void;
}

const ASSIGNABLE_ROLE_CODES = ['owner', 'admin', 'creator'] as const;

export function UserPopover({
  memberId,
  username,
  communityId,
  currentRole,
  canManageRoles,
  anchorRect,
  onClose,
  onRoleChanged,
}: UserPopoverProps) {
  const supabase = useSupabase();
  const popoverRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState(currentRole ?? null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleAssignRole = useCallback(async (roleCode: string) => {
    setSaving(true);
    setError(null);
    const { error: err } = await assignRole(supabase, {
      communityId,
      memberId,
      roleCode,
    });
    if (err) {
      setError(typeof err === 'object' && 'message' in err ? err.message : t('common.error'));
    } else {
      setActiveRole(roleCode);
      onRoleChanged?.(memberId, roleCode);
    }
    setSaving(false);
  }, [supabase, communityId, memberId, onRoleChanged, t]);

  const handleRemoveRole = useCallback(async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await removeRole(supabase, { communityId, memberId });
    if (err) {
      setError(t('common.error'));
    } else {
      setActiveRole(null);
      onRoleChanged?.(memberId, null);
    }
    setSaving(false);
  }, [supabase, communityId, memberId, onRoleChanged, t]);

  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 240);
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 220));

  if (!canManageRoles) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 w-[200px] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] shadow-xl"
      style={{ top, left }}
    >
      {/* Title */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <Shield className="h-4 w-4 text-brand-blue" strokeWidth={2} />
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{username}</span>
      </div>

      {error && (
        <p className="px-3 py-1.5 text-xs text-red-500">{error}</p>
      )}

      {/* Roles */}
      <div className="p-1.5">
        {ASSIGNABLE_ROLE_CODES.map((code) => {
          const isActive = activeRole === code;
          return (
            <button
              key={code}
              onClick={() => handleAssignRole(code)}
              disabled={saving || isActive}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition ${
                isActive
                  ? 'bg-brand-blue/10 text-brand-blue'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e]'
              } disabled:opacity-50`}
            >
              <div>
                <span className={`text-sm font-semibold ${isActive ? 'text-brand-blue' : ''}`}>
                  {t(`roles.${code}`)}
                </span>
                <p className="text-[10px] text-gray-400">
                  {code === 'owner' ? t('moderation.allTribunes') : code === 'creator' ? t('moderation.contentOnly') : t('moderation.thisTribune')}
                </p>
              </div>
              {isActive && (
                <div className="h-2 w-2 rounded-full bg-brand-blue" />
              )}
            </button>
          );
        })}

        {activeRole && (
          <button
            onClick={handleRemoveRole}
            disabled={saving}
            className="mt-0.5 w-full rounded-md px-3 py-2 text-left text-xs text-gray-400 transition hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500 disabled:opacity-50"
          >
            {t('moderation.removeRole')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
