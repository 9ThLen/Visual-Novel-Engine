import { act, renderHook } from "@testing-library/react";
import { useSceneExecutor } from "@/lib/engine/useSceneExecutor";
import type { TimelineStep } from "@/lib/engine/types";

function makeTextStep(id: string, content: string): TimelineStep {
  return {
    id, blockType: "text",
    data: { content, typewriterSpeed: 0.5, anchorTo: "background" },
    collapsed: false, enabled: true,
  };
}

function makeTransitionStep(id: string, targetSceneId: string): TimelineStep {
  return {
    id, blockType: "transition",
    data: { mode: "scene", targetSceneId, transitionType: "fade", duration: 0.4 },
    collapsed: false, enabled: true,
  };
}

function makeChoiceStep(id: string): TimelineStep {
  return {
    id, blockType: "choice",
    data: {
      options: [
        { id: "choice-a", text: "Go A", targetSceneId: "scene-a" },
        { id: "choice-b", text: "Go B", targetSceneId: null },
      ],
    },
    collapsed: false, enabled: true,
  };
}

describe("sync tests", () => {
  it("text step", () => {
    const { result } = renderHook(() => useSceneExecutor([makeTextStep("s1", "hello")]));
    expect(result.current.currentStepIndex).toBe(0);
    expect(result.current.isTyping).toBe(true);
    expect(result.current.canAdvance).toBe(true);
  });

  it("choice step", () => {
    const { result } = renderHook(() => useSceneExecutor([makeChoiceStep("c1")]));
    expect(result.current.sceneState.currentChoices?.length).toBe(2);
    expect(result.current.canAdvance).toBe(false);
  });

  it("transition step", () => {
    const { result } = renderHook(() => useSceneExecutor([makeTransitionStep("t1", "scene-2")]));
    expect(result.current.canAdvance).toBe(true);
    expect(result.current.sceneState.isTransitioning).toBe(true);
  });

  it("skip disabled", () => {
    const d1 = { ...makeTextStep("d1", "x"), enabled: false };
    const { result } = renderHook(() => useSceneExecutor([d1, makeTextStep("d2", "y")]));
    expect(result.current.currentStepIndex).toBe(1);
    expect(result.current.isTyping).toBe(true);
  });
});
