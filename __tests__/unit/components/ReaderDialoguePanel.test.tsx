import React from "react";
import { act, render, screen } from "@testing-library/react";
import { Animated, type LayoutChangeEvent, type ViewProps } from "react-native";
import { ReaderDialoguePanel } from "@/components/reader/ReaderDialoguePanel";
import { mockColors, ReaderControlsStub } from "./reader-test-utils";

// Components use the CJS module loader installed by vitest.setup.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = require("react-native") as {
  View: React.ComponentType<ViewProps>;
};
const OriginalView = native.View;
const layout = { measure: (_event: LayoutChangeEvent) => {} };
beforeAll(() => {
  native.View = function MeasuredView({ onLayout, ...viewProps }: ViewProps) {
    if (onLayout) layout.measure = onLayout;
    return <OriginalView {...viewProps} />;
  };
});
afterAll(() => {
  native.View = OriginalView;
});
const props = {
  colors: mockColors,
  speaker: "Narrator",
  speakerTextStyle: {},
  displayedText: "A quiet room.",
  isTyping: false,
  dialogueTextStyle: { fontSize: 16, lineHeight: 26.4 },
  cursorStyle: {},
  choices: [],
  choicesFontSize: 16,
  getChoiceAccessibilityLabel: (text: string) => text,
  onSelectChoice: vi.fn(),
  onTap: vi.fn(),
  pagesLength: 1,
  pageIndex: 0,
  readerControls: <ReaderControlsStub />,
};

function measure(height: number) {
  act(() =>
    layout.measure({
      nativeEvent: { layout: { height, width: 400, x: 0, y: 0 } },
    } as LayoutChangeEvent),
  );
}

it("keeps the same panel mounted and animates measured expansion and contraction", () => {
  const timing = vi.spyOn(Animated, "timing");
  const { rerender } = render(<ReaderDialoguePanel {...props} />);
  const panel = screen.getByTestId("reader-dialogue-panel-classic");
  measure(180);
  rerender(
    <ReaderDialoguePanel
      {...props}
      displayedText="Another line."
      speaker={null}
    />,
  );
  expect(screen.getByTestId("reader-dialogue-panel-classic")).toBe(panel);
  const choices = [
    {
      id: "go",
      text: "Go",
      targetSceneId: "next",
      nextSceneId: "next",
      index: 0,
    },
  ];
  rerender(<ReaderDialoguePanel {...props} choices={choices} />);
  measure(260);
  expect(timing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 262, duration: 240 }),
  );
  rerender(<ReaderDialoguePanel {...props} />);
  measure(180);
  expect(timing).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 1 }),
  );
  expect(timing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 182, duration: 240 }),
  );
  timing.mockRestore();
});

it("retains outgoing text while collapsing and removes hidden controls from accessibility", () => {
  const timing = vi.spyOn(Animated, "timing");
  const { rerender } = render(<ReaderDialoguePanel {...props} />);
  measure(180);
  rerender(<ReaderDialoguePanel {...props} displayedText="" speaker={null} />);
  expect(screen.getByText("A quiet room.")).toBeTruthy();
  expect(
    screen
      .getByTestId("reader-dialogue-panel-classic")
      .getAttribute("aria-hidden"),
  ).toBe("true");
  expect(timing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 0, duration: 240 }),
  );
  rerender(
    <ReaderDialoguePanel
      {...props}
      displayedText=""
      choices={[
        {
          id: "go",
          text: "Go",
          targetSceneId: "next",
          nextSceneId: "next",
          index: 0,
        },
      ]}
    />,
  );
  expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  timing.mockRestore();
});

it("keeps the full rich text in layout while only revealing its visible prefix", () => {
  render(<ReaderDialoguePanel {...props} visibleCount={1} isTyping />);
  const text = screen.getByTestId("reader-dialogue-text");
  expect(text.textContent).toBe("A quiet room.|");
  expect(
    (text.querySelector("[aria-hidden]") as HTMLElement).style.opacity,
  ).toBe("0");
});
