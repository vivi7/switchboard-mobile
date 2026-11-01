import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { request, useConnection } from '@/store/connection';
import type { Project, ProjectPlan } from './model';

/** get-project-tree, shared by every screen that shows projects. */
export function useProjectTree() {
  const online = useConnection((s) => s.status.state === 'online');
  return useQuery({
    queryKey: ['project-tree'],
    queryFn: () => request<{ projects: Project[] }>('get-project-tree', [false]),
    enabled: online,
  });
}

export function useProject(id: string | undefined) {
  const tree = useProjectTree();
  return { ...tree, project: tree.data?.projects.find((p) => p.id === id) };
}

export function useProjectPlan(id: string | undefined) {
  const online = useConnection((s) => s.status.state === 'online');
  return useQuery({
    queryKey: ['project-plan', id],
    queryFn: () => request<ProjectPlan & { error?: string }>('get-project-plan', [id]),
    enabled: online && !!id,
  });
}

/** Call the computer; a returned { error } becomes a thrown one. */
export async function act<T = any>(method: string, params: unknown[]): Promise<T> {
  const result: any = await request(method, params);
  if (result && typeof result === 'object' && result.error) throw new Error(result.error);
  if (result && typeof result === 'object' && result.ok === false) throw new Error(result.error || 'That did not work');
  return result;
}

/** The time, again every minute: a snooze ends without anything else changing. */
export function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
