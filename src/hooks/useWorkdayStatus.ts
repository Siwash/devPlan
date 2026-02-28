import { useState, useEffect, useCallback, useRef } from 'react';
import { calendarApi } from '../lib/api';
import type { DeveloperWorkload } from '../lib/types';

export interface WorkdayStatus {
  /** Dates where the developer is fully booked (excluding current task) */
  fullyBooked: Set<string>;
  /** Dates where the developer has < 2h remaining (excluding current task) */
  nearlyFull: Set<string>;
  loading: boolean;
}

/**
 * Hook that loads a developer's workload for a date range and computes
 * which dates are fully booked or nearly full, **excluding** hours from
 * a specific task (so the same task can still be scheduled on those days).
 */
export function useWorkdayStatus(
  ownerId: number | undefined,
  currentTaskId: number | undefined,
  rangeStart: string,
  rangeEnd: string,
): WorkdayStatus {
  const [status, setStatus] = useState<WorkdayStatus>({
    fullyBooked: new Set(),
    nearlyFull: new Set(),
    loading: false,
  });

  useEffect(() => {
    if (!ownerId || !rangeStart || !rangeEnd) {
      setStatus({ fullyBooked: new Set(), nearlyFull: new Set(), loading: false });
      return;
    }

    let cancelled = false;
    setStatus(prev => ({ ...prev, loading: true }));

    calendarApi
      .getWorkload(ownerId, rangeStart, rangeEnd, true)
      .then((workloads: DeveloperWorkload[]) => {
        if (cancelled) return;
        const booked = new Set<string>();
        const nearFull = new Set<string>();

        for (const w of workloads) {
          // Calculate hours used by OTHER tasks (exclude current task)
          const otherHours = w.tasks
            .filter(t => t.task_id !== currentTaskId)
            .reduce((sum, t) => sum + t.daily_hours, 0);

          const remaining = w.max_hours - otherHours;
          if (remaining <= 0) {
            booked.add(w.date);
          } else if (remaining < 2) {
            nearFull.add(w.date);
          }
        }

        setStatus({ fullyBooked: booked, nearlyFull: nearFull, loading: false });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ fullyBooked: new Set(), nearlyFull: new Set(), loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ownerId, currentTaskId, rangeStart, rangeEnd]);

  return status;
}

/**
 * Hook for use in EditableTaskTable — loads workload data on demand
 * (when a date cell enters edit mode) and caches it per developer.
 */
export function useWorkloadCache() {
  const [cache, setCache] = useState<Map<number, DeveloperWorkload[]>>(new Map());
  const loadingRef = useRef<Set<number>>(new Set());

  const loadWorkload = useCallback((developerId: number, rangeStart: string, rangeEnd: string) => {
    // Already cached or currently loading
    if (cache.has(developerId) || loadingRef.current.has(developerId)) return;

    loadingRef.current.add(developerId);

    calendarApi
      .getWorkload(developerId, rangeStart, rangeEnd, true)
      .then((workloads) => {
        setCache(prev => {
          const next = new Map(prev);
          next.set(developerId, workloads);
          return next;
        });
      })
      .catch(() => {
        // Silently fail — dates just won't be marked
      })
      .finally(() => {
        loadingRef.current.delete(developerId);
      });
  }, [cache]);

  const getWorkloads = useCallback(
    (developerId: number): DeveloperWorkload[] | undefined => cache.get(developerId),
    [cache],
  );

  /** Clear cache for a specific developer (e.g. after task update) */
  const invalidate = useCallback((developerId?: number) => {
    if (developerId != null) {
      setCache(prev => {
        const next = new Map(prev);
        next.delete(developerId);
        return next;
      });
    } else {
      setCache(new Map());
    }
  }, []);

  return { loadWorkload, getWorkloads, invalidate };
}
