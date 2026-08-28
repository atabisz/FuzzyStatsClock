/**
 * Analog dial hand angles, ported from FuzzyClock.Core/DialGeometry.cs.
 *
 * Degrees clockwise from 12 o'clock, which is also SVG's rotation convention for a hand drawn
 * pointing up -- so these numbers go straight into a `rotate(...)` transform with no conversion, and
 * the port keeps degrees rather than switching to radians for that reason.
 *
 * Both formulas are copied literally, including the `hour % 12` that makes 12 and 24 both read as 0.
 * The hour hand interpolates within the hour (720 = 12 hours of minutes), so 3:15 is 97.5° and not
 * 90° -- the detail that makes a dial look right rather than stepped.
 */

/** `((hour % 12) / 12 + minute / 720) * 360`. */
export function hourAngleDegrees(hour: number, minute: number): number {
  return ((hour % 12) / 12 + minute / 720) * 360
}

/** `(minute / 60) * 360`. */
export function minuteAngleDegrees(minute: number): number {
  return (minute / 60) * 360
}
