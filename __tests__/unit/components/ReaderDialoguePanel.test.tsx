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

it("keeps the same panel mounted and animates only the collapse", () => {
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

  // Closing animates to 0, opening back to 1. The panel's height while open is
  // its content's, so growing it is not an animation any more — which is the
  // point: an animated height that lags the content is a clipped panel.
  rerender(<ReaderDialoguePanel {...props} displayedText="" speaker={null} />);
  expect(timing).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 0, duration: 240 }),
  );
  rerender(<ReaderDialoguePanel {...props} />);
  expect(timing).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 1, duration: 240 }),
  );
  timing.mockRestore();
});

/**
 * The property a browser run found broken: at a large font on a narrow screen
 * the panel kept a height measured earlier and its own controls ended up
 * outside its background. An open panel must carry no height ceiling at all.
 */
it("puts no height ceiling on an open panel", () => {
  const { rerender } = render(<ReaderDialoguePanel {...props} />);
  measure(180);
  const panel = screen.getByTestId("reader-dialogue-panel-classic");
  expect(panel.style.maxHeight).toBe("");
  expect(panel.style.height).toBe("");

  // And it still does not acquire one when the content grows.
  rerender(
    <ReaderDialoguePanel {...props} displayedText="A much longer line." />,
  );
  measure(420);
  expect(screen.getByTestId("reader-dialogue-panel-classic").style.maxHeight)
    .toBe("");
});

/**
 * Auto, Back and History were inside the collapsing panel, so a scene with no
 * text and no choices took the reader's only way out with it, and nothing
 * brings them back.
 */
it("keeps the reader controls outside the panel that collapses", () => {
  const { rerender } = render(<ReaderDialoguePanel {...props} />);
  measure(180);
  const panel = screen.getByTestId("reader-dialogue-panel-classic");
  const controls = screen.getByTestId("reader-controls-row");
  expect(panel.contains(controls)).toBe(false);

  rerender(<ReaderDialoguePanel {...props} displayedText="" speaker={null} />);
  const collapsed = screen.getByTestId("reader-dialogue-panel-classic");
  expect(collapsed.getAttribute("aria-hidden")).toBe("true");
  // Still there, still reachable, while the panel is hidden.
  const stillThere = screen.getByTestId("reader-controls-row");
  expect(collapsed.contains(stillThere)).toBe(false);
  expect(stillThere.closest("[aria-hidden=\"true\"]")).toBeNull();
});

it("retains outgoing text while collapsing", () => {
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
