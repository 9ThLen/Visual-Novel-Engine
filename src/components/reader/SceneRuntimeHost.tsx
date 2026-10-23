/**
 * The one executor of the scene on screen, shared by whatever shows it
 * (docs/plans/COMIC-MODE-PLAN.md, section 5.2).
 *
 * The novel reader and, later, the comic reader are two ways of showing one
 * run of a scene. Were each to call `useSceneExecutor` itself, each would run
 * the scene: switching between them would restart it, apply `score += 1` a
 * second time and play its sounds again. So the executor lives here, above
 * them, with the execution journal it keeps, and they read it through
 * `useSceneRuntime()`.
 *
 * The host is keyed by the scene and the playback generation where it is
 * mounted: a new scene, or a save loaded into the scene on screen, remounts it
 * and starts the run afresh from `initialVariables` — the variables the scene
 * was entered with, never the ones the run has since changed.
 */
import React, { createContext, useContext } from 'react';

import type { RuntimeVariables } from '@/lib/engine/runtime-types';
import type { TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor, type UseSceneExecutorReturn } from '@/lib/engine/useSceneExecutor';

export interface SceneRuntime extends UseSceneExecutorReturn {
  /** The timeline being run. */
  timeline: TimelineStep[];
}

const SceneRuntimeContext = createContext<SceneRuntime | null>(null);

interface SceneRuntimeHostProps {
  timeline: TimelineStep[];
  /** The variables the scene was entered with. */
  initialVariables?: RuntimeVariables;
  /** See `useSceneExecutor`'s `resetKey`: a new value restarts the run. */
  resetKey?: string | number;
  children: React.ReactNode;
}

export function SceneRuntimeHost({ timeline, initialVariables, resetKey, children }: SceneRuntimeHostProps) {
  const executor = useSceneExecutor(timeline, { initialVariables, resetKey });
  return (
    <SceneRuntimeContext.Provider value={{ ...executor, timeline }}>
      {children}
    </SceneRuntimeContext.Provider>
  );
}

export function useSceneRuntime(): SceneRuntime {
  const runtime = useContext(SceneRuntimeContext);
  if (!runtime) throw new Error('useSceneRuntime() needs a SceneRuntimeHost above it');
  return runtime;
}
