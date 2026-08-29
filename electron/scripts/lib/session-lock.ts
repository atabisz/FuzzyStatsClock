/**
 * Is the workstation locked? The gate for any probe whose subject is what is on the glass.
 *
 * ## The failure this was written from
 *
 * `probe-pixels.ts` reported all four of its arms red on its first two runs, including the line "THE WIDGET IS
 * PAINTING A BOX -- removing main's setOpacity call broke transparency". It had not. The screen was locked, and
 * a `CopyFromScreen` from a process on the default desktop reads black while `LogonUI.exe` owns the display --
 * every stage of the probe photographed the same near-black rectangle and the comparison between them was
 * perfectly consistent and entirely meaningless.
 *
 * That is worse than a probe that does not exist, because the output was specific, alarming and wrong. A
 * capture-based arm therefore has to answer "was anyone looking at the screen" before it reports anything, and
 * the verdict when the answer is no is INCONCLUSIVE -- never FAIL, and never PASS either.
 *
 * ## Why `LogonUI.exe` and not an API
 *
 * Win32 has session-state NOTIFICATIONS (`WTSRegisterSessionNotification`, `WM_WTSSESSION_CHANGE`) but no
 * queryable "is this session locked" flag; `WTSQuerySessionInformation`'s `WTSSessionInfo` reports the session
 * as Active either way. The presence of `LogonUI.exe` is the same signal PAI's own `FeedIngest.cmd` gates on
 * for the same reason, and it is a positive test -- the process exists only while the secure desktop is up.
 *
 * Fails OPEN on purpose: if the query itself breaks, the answer is "not locked", so a broken check costs a
 * possibly-contaminated run rather than silently disabling every capture arm forever.
 */

import { spawnSync } from "node:child_process"

export interface LockState {
  locked: boolean
  /** What the check actually observed, for the probe to print rather than paraphrase. */
  detail: string
}

export function sessionLockState(): LockState {
  if (process.platform !== "win32") {
    return { locked: false, detail: `not win32 (${process.platform}) -- no LogonUI to look for` }
  }
  const run = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      // `Get-Process` writes to stderr and exits 1 when nothing matches, so the count is taken through
      // `@(...)` and `-ErrorAction SilentlyContinue` rather than off the exit code.
      "@(Get-Process LogonUI -ErrorAction SilentlyContinue).Count",
    ],
    { encoding: "utf8", windowsHide: true },
  )
  const count = Number(run.stdout.trim())
  if (!Number.isFinite(count)) {
    return {
      locked: false,
      detail: `LogonUI query returned no number (${run.stdout.trim().slice(0, 60)}) -- failing OPEN, so this ` +
        `run is reported as unlocked and may be contaminated`,
    }
  }
  return count > 0
    ? { locked: true, detail: `${String(count)} LogonUI.exe process(es) -- the secure desktop owns the display` }
    : { locked: false, detail: "no LogonUI.exe -- the interactive desktop is being presented" }
}
