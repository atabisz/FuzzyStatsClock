/**
 * Translated from FuzzyClock.App.Tests/RightClickMenuGateTests.cs -- all 6 DataRows, same
 * expectations. The predicate has 2^3 inputs and the C# covers 6 of the 8, so the remaining two are
 * added, both measured off the compiled C# (`dotnet run -- rmb`, which prints all eight).
 */
import { describe, expect, test } from "bun:test"
import { shouldOpenContextMenu } from "../src/core/menu-gate.js"

describe("shouldOpenContextMenu, translated from RightClickMenuGateTests", () => {
  test.each([
    [false, false, false, true, "normal state -> open"],
    [true, false, false, false, "dragging -> suppress (RMB-02)"],
    [false, true, false, false, "ghost active, no Ctrl+Alt -> suppress (RMB-03)"],
    [false, true, true, true, "ghost active + Ctrl+Alt -> open (CTRLALT-01)"],
    [true, true, true, false, "dragging beats ghost+Ctrl+Alt (RMB-02 wins)"],
    [false, false, true, true, "Ctrl+Alt alone (no ghost) -> open (no-op guard)"],
  ] as const)("drag=%p ghost=%p ctrlAlt=%p -> %p (%s)", (isDragging, isGhostActive, isCtrlAltHeld, expected) => {
    expect(shouldOpenContextMenu(isDragging, isGhostActive, isCtrlAltHeld)).toBe(expected)
  })
})

describe("shouldOpenContextMenu, the two rows that complete the truth table", () => {
  test.each([
    [true, false, true, false, "dragging with Ctrl+Alt held -> still suppressed"],
    [true, true, false, false, "dragging while ghosted -> suppressed by either rule"],
  ] as const)("drag=%p ghost=%p ctrlAlt=%p -> %p (%s)", (isDragging, isGhostActive, isCtrlAltHeld, expected) => {
    expect(shouldOpenContextMenu(isDragging, isGhostActive, isCtrlAltHeld)).toBe(expected)
  })

  test("dragging suppresses regardless of the other two inputs", () => {
    // Stated once rather than spread across four rows. Note what this does NOT prove: the C#'s
    // "RMB-02 wins" precedence is unobservable, since both rules return false -- measured by swapping
    // the two guard lines and finding all eight answers unchanged. This pins the drag rule, not an
    // order.
    for (const isGhostActive of [false, true]) {
      for (const isCtrlAltHeld of [false, true]) {
        expect(shouldOpenContextMenu(true, isGhostActive, isCtrlAltHeld)).toBe(false)
      }
    }
  })

  test("with no drag, only a ghosted widget without Ctrl+Alt suppresses", () => {
    expect(shouldOpenContextMenu(false, true, false)).toBe(false)
    for (const [isGhostActive, isCtrlAltHeld] of [[false, false], [false, true], [true, true]] as const) {
      expect(shouldOpenContextMenu(false, isGhostActive, isCtrlAltHeld)).toBe(true)
    }
  })
})
