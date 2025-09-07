// Generate an ad-hoc calibration program that imports the user's robot.py
// and runs: drive straight 200mm, wait 2 seconds, then turn 360 degrees.
// The program defines an async run() function to be compatible with the
// multi-module orchestrator which will import run() as main.

export function generateCalibrationProgram(): string {
  return `
# Auto-generated Calibration Program by PyBricks Pilot

from pybricks.tools import wait

# Import the user's robot setup (expects robot.py with drivebase as 'db')
from robot import db

async def run():
    print("[PILOT] Calibration starting: drive 200mm, wait 2s, turn 360°")
    try:
        # Reset telemetry if available
        try:
            await db.reset()
        except Exception as e:
            pass

        # Drive straight 200mm
        await db.straight(200)
        await wait(2000)

        # Turn 360 degrees
        await db.turn(360)

        print("[PILOT] Calibration sequence complete.")
        print("[PILOT] Measure actual distance and rotation, then adjust settings in the app.")
    except Exception as e:
        print("[PILOT] Calibration error:", e)

`;
}
