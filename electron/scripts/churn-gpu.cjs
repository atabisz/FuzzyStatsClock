/**
 * A short-lived Electron window that does continuous GPU work, then exits.
 *
 * Sole purpose: give `probe-typeperf.ts` a deterministic source of new
 * `GPU Engine(*engtype_3D)` instances, so the spawn-time-binding arm (A5) and the
 * recycle arm (A6) can be demonstrated rather than waited for. Three cheaper churn
 * sources were tried and rejected:
 *
 *   - `notepad.exe` — Win11 Notepad is a tabbed single-instance app, so a second
 *     launch adds a tab to the *existing* process. No new pid, no new pid-scoped
 *     engine instance. Measured +35 instances on the cold start and +0 after.
 *   - a WPF window in PowerShell — `$w.Show()` with `Start-Sleep` blocking the
 *     thread means no message pump, so the window never renders and never creates a
 *     D3D device.
 *   - the same, spawned with `stdio: "ignore"` and `detached: true` — the host died
 *     immediately, exit code 0, no output.
 *
 * An Electron window is the right answer anyway: it is what the port actually ships,
 * so what it registers with PDH is directly relevant rather than a proxy.
 *
 * The animating canvas is deliberate. A window that renders once and sits still can
 * have its GPU work optimised away entirely; a `requestAnimationFrame` loop keeps
 * real 3D-engine work flowing, which also gives A4's `nvidia-smi` cross-read
 * something above idle to compare against.
 *
 * MUST be launched through `scripts/lib/electron-launch.ts`, never by invoking
 * `electron.exe` directly from a shell. VSCode exports `ELECTRON_RUN_AS_NODE=1`, and
 * under it this file runs as plain Node: `require("electron")` yields the path string,
 * `app` is undefined, and the process dies on line 56 having rendered nothing. It
 * exits 0 when its output is discarded, so it looks like a successful launch — which is
 * how the "this host does not register new GPU instances" conclusion was reached, and it
 * was false. With the variable scrubbed, one launch adds one new
 * `pid_<N>_luid_..._engtype_3D` instance, measured 706→708 counter-path lines.
 *
 * Run: `bun scripts/probe-typeperf.ts` (which launches this correctly).
 */

const { app, BrowserWindow } = require("electron")

const LIFETIME_SEC = Number(process.argv[2] ?? 25)

const PAGE = `data:text/html,${encodeURIComponent(`
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#111;overflow:hidden}canvas{display:block}</style>
<canvas id="c" width="320" height="200"></canvas>
<script>
  const ctx = document.getElementById("c").getContext("2d")
  let t = 0
  function frame() {
    t += 0.05
    ctx.fillStyle = "#111"
    ctx.fillRect(0, 0, 320, 200)
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = "hsl(" + ((i * 3 + t * 40) % 360) + ",80%,55%)"
      const r = 30 + 24 * Math.sin(t + i * 0.12)
      ctx.beginPath()
      ctx.arc(160 + r * Math.cos(i + t), 100 + r * Math.sin(i * 1.7 + t), 6, 0, 6.283)
      ctx.fill()
    }
    requestAnimationFrame(frame)
  }
  frame()
</script>`)}`

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 320,
    height: 200,
    title: "probe-typeperf GPU churn",
    // Kept out of the taskbar and off the top so it disturbs the desktop as little
    // as a visible window can. It must be visible: an occluded or hidden window can
    // have its rendering throttled, which is exactly the work being generated.
    skipTaskbar: true,
    x: 40,
    y: 40,
    webPreferences: { backgroundThrottling: false },
  })
  void win.loadURL(PAGE)
  setTimeout(() => app.quit(), LIFETIME_SEC * 1000)
})
