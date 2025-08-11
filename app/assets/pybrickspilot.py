"""
PybricksPilot - Auto-instrumentation and telemetry system for Pybricks

This module provides automatic telemetry collection and remote control capabilities
for Pybricks programs. Users can register their hardware components and the system
will automatically send telemetry data and accept control commands via stdio.

Usage:
    import pybrickspilot as pilot

    # Register hardware
    pilot.register_hub(hub)
    pilot.register_motor("left", left_motor)
    pilot.register_motor("right", right_motor)
    pilot.register_drivebase(drive_base)
    pilot.register_sensor("color", color_sensor)

    # Start telemetry (call this in your main loop)
    pilot.send_telemetry()

    # Check for remote commands (call this in your main loop)
    pilot.process_commands()
"""

# MicroPython compatible imports
import ujson as json

from pybricks.tools import StopWatch

_stopwatch = None


def get_time_ms():
    global _stopwatch
    if _stopwatch is None:
        _stopwatch = StopWatch()
    return _stopwatch.time()


from pybricks.tools import read_input_byte

_has_read_input_byte = True

from pybricks.tools import run_task, multitask, wait
from pybricks.parameters import Color


# Global registry for hardware components
_hub = None
_motors = {}
_sensors = {}
_drivebase = None
_gyro_sensor = None

# Telemetry configuration
_telemetry_enabled = True
_telemetry_interval_ms = 100  # Send telemetry every 100ms
_last_telemetry_time = 0

# Command processing (simplified for MicroPython)
_command_processing_enabled = True

# Command buffer for non-blocking input processing
_command_buffer = ""


def register_hub(hub):
    """Register the main hub for battery and IMU telemetry."""
    global _hub
    _hub = hub
    print("[PILOT] Registered hub")


def register_motor(name, motor):
    """Register a motor for telemetry and remote control."""
    global _motors
    _motors[name] = motor
    print("[PILOT] Registered motor '" + name + "'")


def register_sensor(name, sensor):
    """Register a sensor for telemetry."""
    global _sensors
    _sensors[name] = sensor
    print("[PILOT] Registered sensor '" + name + "'")


def register_drivebase(drivebase):
    """Register a drivebase for remote control."""
    global _drivebase
    _drivebase = drivebase
    print("[PILOT] Registered drivebase")


def register_gyro(gyro_sensor):
    """Register a gyro sensor for enhanced IMU data."""
    global _gyro_sensor
    _gyro_sensor = gyro_sensor
    print("[PILOT] Registered gyro sensor")


def set_telemetry_enabled(enabled=True):
    """Enable or disable telemetry transmission."""
    global _telemetry_enabled
    _telemetry_enabled = enabled
    print("[PILOT] Telemetry", "enabled" if enabled else "disabled")


def set_telemetry_interval(interval_ms):
    """Set the telemetry transmission interval in milliseconds."""
    global _telemetry_interval_ms
    _telemetry_interval_ms = max(50, interval_ms)  # Minimum 50ms
    print("[PILOT] Telemetry interval set to", _telemetry_interval_ms, "ms")


def _get_motor_telemetry():
    """Collect telemetry data from all registered motors."""
    motor_data = {}

    for name, motor in _motors.items():
        try:
            motor_data[name] = {
                "angle": float(motor.angle()),
                "speed": float(motor.speed()),
            }

            # Try to get control data if motor supports it
            try:
                motor_data[name]["load"] = float(motor.load())
            except:
                pass

        except Exception as e:
            motor_data[name] = {"error": str(e)}

    return motor_data


async def _get_sensor_telemetry():
    """Collect telemetry data from all registered sensors."""
    sensor_data = {}

    for name, sensor in _sensors.items():
        try:
            # Try common sensor methods
            if hasattr(sensor, "color"):
                try:
                    color_value = await sensor.color(True)
                    sensor_data[name] = {
                        "type": "color",
                        "color": str(color_value),  # Convert Color enum to string
                    }
                    if hasattr(sensor, "reflection"):
                        try:
                            reflection_value = await sensor.reflection()
                            if isinstance(reflection_value, (int, float)):
                                sensor_data[name]["reflection"] = float(
                                    reflection_value
                                )
                        except Exception as e:
                            sensor_data[name]["reflection_error"] = str(e)
                    if hasattr(sensor, "ambient"):
                        try:
                            ambient_value = await sensor.ambient()
                            if isinstance(ambient_value, (int, float)):
                                sensor_data[name]["ambient"] = float(ambient_value)
                        except Exception as e:
                            sensor_data[name]["ambient_error"] = str(e)
                except Exception as e:
                    sensor_data[name] = {
                        "type": "color",
                        "error": f"Color read error: {str(e)}",
                    }

            elif hasattr(sensor, "distance"):
                try:
                    distance_value = None

                    try:
                        distance_value = await sensor.distance()
                    except (TypeError, AttributeError):
                        distance_value = f"All methods failed: {str(e2)}, {str(e3)}"

                    # Ensure we have a numeric value, not a string or wait object
                    if isinstance(distance_value, (int, float)):
                        sensor_data[name] = {
                            "type": "ultrasonic",
                            "distance": float(distance_value),
                        }
                    else:
                        sensor_data[name] = {
                            "type": "ultrasonic",
                            "error": f"Invalid distance value: {distance_value}",
                            "raw_value": str(distance_value),
                        }
                except Exception as e:
                    sensor_data[name] = {
                        "type": "ultrasonic",
                        "error": f"Distance read error: {str(e)}",
                    }

            elif hasattr(sensor, "force"):
                sensor_data[name] = {
                    "type": "force",
                    "force": float(await sensor.force()),
                    "pressed": bool(await sensor.pressed()),
                }

            elif hasattr(sensor, "angle"):
                sensor_data[name] = {
                    "type": "rotation",
                    "angle": float(await sensor.angle()),
                    "speed": (
                        float(await sensor.speed())
                        if hasattr(sensor, "speed")
                        else None
                    ),
                }

            else:
                # Generic sensor - try to get any available data
                sensor_data[name] = {
                    "type": "generic",
                    "value": str(sensor),
                }

        except Exception as e:
            sensor_data[name] = {"type": "error", "error": str(e)}

    return sensor_data


def _get_hub_telemetry():
    """Collect telemetry data from the hub."""
    hub_data = {}

    if _hub is None:
        return hub_data

    try:
        # Battery information
        if hasattr(_hub, "battery"):
            battery = _hub.battery
            hub_data["battery"] = {
                "voltage": battery.voltage(),
                "current": battery.current(),
            }

        # IMU data
        if hasattr(_hub, "imu"):
            imu = _hub.imu
            try:
                # Start with just heading data (simple float)
                imu_data = {}

                # Heading is a simple float - should work fine
                try:
                    imu_data["heading"] = float(imu.heading())
                except Exception as he:
                    imu_data["heading_error"] = str(he)

                # Try to get acceleration data using simple indexing
                try:
                    acc = imu.acceleration()
                    # Try to access as if it's indexable
                    imu_data["acceleration"] = [acc[0], acc[1], acc[2]]
                except Exception as ae:
                    # Skip acceleration data if Matrix conversion fails
                    imu_data["acceleration_error"] = "Matrix conversion not supported"

                # Try to get angular velocity data
                try:
                    ang = imu.angular_velocity()
                    # Try to access as if it's indexable
                    imu_data["angular_velocity"] = [ang[0], ang[1], ang[2]]
                except Exception as ave:
                    # Skip angular velocity data if Matrix conversion fails
                    imu_data["angular_velocity_error"] = (
                        "Matrix conversion not supported"
                    )

                hub_data["imu"] = imu_data

            except Exception as e:
                hub_data["imu"] = {"error": str(e)}

        # System information
        if hasattr(_hub, "system"):
            system = _hub.system
            try:
                hub_data["system"] = {
                    "name": system.name(),
                }
            except:
                pass

    except Exception as e:
        hub_data["error"] = str(e)

    # Add gyro sensor data if registered separately
    if _gyro_sensor:
        try:
            if hasattr(_gyro_sensor, "angle"):
                hub_data["gyro"] = {
                    "angle": float(_gyro_sensor.angle()),
                    "speed": (
                        float(_gyro_sensor.speed())
                        if hasattr(_gyro_sensor, "speed")
                        else None
                    ),
                }
        except Exception as e:
            hub_data["gyro"] = {"error": str(e)}

    return hub_data


async def send_telemetry():
    """Send telemetry data if enabled and interval has passed."""
    global _last_telemetry_time

    if not _telemetry_enabled:
        return

    current_time = get_time_ms()

    if current_time - _last_telemetry_time < _telemetry_interval_ms:
        return

    _last_telemetry_time = current_time

    # Collect all telemetry data
    telemetry = {
        "timestamp": current_time,
        "type": "telemetry",
    }

    # Add motor data
    motor_data = _get_motor_telemetry()
    if motor_data:
        telemetry["motors"] = motor_data

    # Add sensor data
    sensor_data = await _get_sensor_telemetry()
    if sensor_data:
        telemetry["sensors"] = sensor_data

    # Add hub data
    hub_data = _get_hub_telemetry()
    if hub_data:
        telemetry["hub"] = hub_data

    # Add drivebase data if available
    if _drivebase:
        try:
            telemetry["drivebase"] = {
                "distance": float(_drivebase.distance()),
                "angle": float(_drivebase.angle()),
            }
            if hasattr(_drivebase, "state"):
                state = _drivebase.state()
                telemetry["drivebase"]["state"] = {
                    "distance": float(state[0]),
                    "drive_speed": float(state[1]),
                    "angle": float(state[2]),
                    "turn_rate": float(state[3]),
                }
        except Exception as e:
            telemetry["drivebase"] = {"error": str(e)}

    # Send telemetry as JSON to stdout
    try:
        print(json.dumps(telemetry))
    except Exception as e:
        print("[PILOT] Telemetry error:", e)


def _execute_command(command):
    """Execute a received command."""
    try:
        action = command.get("action")

        # Debug: Print drivebase status for troubleshooting
        if action in ["drive", "turn", "stop"]:
            print(
                "[PILOT] Command:",
                action,
                "- Drivebase registered:",
                _drivebase is not None,
            )

        if action == "drive" and _drivebase:
            # Drive command: {"action": "drive", "distance": 100, "speed": 200}
            distance = command.get("distance", 0)
            speed = command.get("speed", 100)
            # Use straight() method with wait=False for non-blocking execution
            _drivebase.settings(straight_speed=speed)
            _drivebase.straight(distance, wait=False)
            print(
                "[PILOT] Executed drive:",
                distance,
                "mm at",
                speed,
                "mm/s (non-blocking)",
            )

        elif action == "turn" and _drivebase:
            # Turn command: {"action": "turn", "angle": 90, "speed": 100}
            angle = command.get("angle", 0)
            speed = command.get("speed", 100)
            # Use turn() method with wait=False for non-blocking execution
            _drivebase.settings(turn_rate=speed)
            _drivebase.turn(angle, wait=False)
            print("[PILOT] Executed turn:", angle, "° at", speed, "°/s (non-blocking)")

        elif action == "stop":
            # Stop command: {"action": "stop"} or {"action": "stop", "motor": "motor_name"}
            motor_name = command.get("motor")
            if motor_name and motor_name in _motors:
                # Stop specific motor
                motor = _motors[motor_name]
                motor.stop()
                print("[PILOT] Stopped motor '" + motor_name + "'")
            elif _drivebase:
                _drivebase.stop()
                print("[PILOT] Executed stop")

        elif action == "drive_continuous" and _drivebase:
            # Continuous drive command: {"action": "drive_continuous", "speed": 100, "turn_rate": 0}
            speed = command.get("speed", 0)
            turn_rate = command.get("turn_rate", 0)
            # Use drive() method for continuous movement
            _drivebase.drive(speed, turn_rate)
            print("[PILOT] Continuous drive:", speed, "mm/s, turn:", turn_rate, "°/s")

        elif action == "motor":
            # Motor command: {"action": "motor", "motor": "left", "angle": 90, "speed": 100}
            # Also support: {"action": "motor", "port": "A", "speed": 100}
            motor_name = command.get("motor") or command.get("port")
            if motor_name and motor_name in _motors:
                motor = _motors[motor_name]
                angle = command.get("angle")
                speed = command.get("speed", 100)

                if angle is not None:
                    motor.run_angle(speed, angle)
                    print(
                        "[PILOT] Motor '" + motor_name + "':",
                        angle,
                        "° at",
                        speed,
                        "°/s",
                    )
                else:
                    # Continuous run
                    motor.run(speed)
                    print(
                        "[PILOT] Motor '" + motor_name + "': running at", speed, "°/s"
                    )
            else:
                print("[PILOT] Unknown motor:", motor_name)

        elif action == "beep" and _hub:
            # Beep command: {"action": "beep", "frequency": 440, "duration": 1000}
            try:
                frequency = command.get("frequency", 440)
                duration = command.get("duration", 1000)
                if hasattr(_hub.speaker, "beep"):
                    _hub.speaker.beep(frequency, duration)
                    print("[PILOT] Beep:", frequency, "Hz for", duration, "ms")
                else:
                    print("[PILOT] Speaker not available for beep")
            except Exception as e:
                print("[PILOT] Beep error:", e)

        elif action == "led" and _hub:
            # LED command: {"action": "led", "color": [255, 0, 0]} or {"action": "led", "color": "red"}
            try:
                color = command.get("color")
                if hasattr(_hub, "light"):
                    if isinstance(color, list) and len(color) >= 3:
                        # RGB color not directly supported - use closest Color enum
                        print("[PILOT] LED RGB not supported, using red")
                        _hub.light.on(Color.RED)
                    elif isinstance(color, str):
                        # Try to use color name
                        color_map = {
                            "red": Color.RED,
                            "green": Color.GREEN,
                            "blue": Color.BLUE,
                            "yellow": Color.YELLOW,
                            "orange": Color.ORANGE,
                            "white": Color.WHITE,
                        }
                        if color.lower() in color_map:
                            _hub.light.on(color_map[color.lower()])
                            print("[PILOT] LED:", color)
                        else:
                            _hub.light.on(Color.WHITE)
                            print("[PILOT] LED: unknown color, using white")
                    else:
                        _hub.light.on(Color.WHITE)
                        print("[PILOT] LED: white (default)")
                else:
                    print("[PILOT] Hub light not available")
            except Exception as e:
                print("[PILOT] LED error:", e)

        elif action == "set_telemetry":
            # Telemetry control: {"action": "set_telemetry", "enabled": true, "interval": 100}
            enabled = command.get("enabled", True)
            interval = command.get("interval")

            set_telemetry_enabled(enabled)
            if interval:
                set_telemetry_interval(interval)

        elif action == "reset_drivebase" and _drivebase:
            # Reset drivebase telemetry: {"action": "reset_drivebase"}
            try:
                _drivebase.reset()
                print("[PILOT] Drivebase telemetry reset - distance and angle set to 0")
            except Exception as e:
                print("[PILOT] Drivebase reset error:", e)

        else:
            print("[PILOT] Unknown command action:", action)

    except Exception as e:
        print("[PILOT] Command execution error:", e)


def process_commands():
    """Process any incoming commands from stdin using non-blocking read_input_byte."""
    global _command_buffer

    try:
        # Read available bytes one at a time (non-blocking)
        bytes_read = 0
        max_bytes_per_call = 50  # Limit bytes read per call to avoid long blocking

        while bytes_read < max_bytes_per_call:
            try:
                byte = read_input_byte()
                if byte is None:
                    # No more data available
                    break

                # Convert byte to character and add to buffer
                char = chr(byte)
                _command_buffer += char
                bytes_read += 1

                # Check for complete command (newline terminated)
                if char == "\n":
                    # Process complete commands in buffer
                    _process_buffered_commands()

            except Exception as e:
                # Error reading byte, stop reading
                break

    except Exception as e:
        print("[PILOT] Command processing error:", e)


def _process_buffered_commands():
    """Process all complete commands in the buffer."""
    global _command_buffer

    try:
        # Split buffer by newlines to get complete commands
        lines = _command_buffer.split("\n")

        # Keep the last incomplete line in the buffer
        _command_buffer = lines[-1] if lines else ""

        # Process each complete command (all but the last line)
        for i in range(len(lines) - 1):
            command_line = lines[i].strip()
            if command_line:
                _process_command_line(command_line)

    except Exception as e:
        print("[PILOT] Buffer processing error:", e)


def process_commands_blocking():
    """Process commands with blocking stdin read (use when stdin input is expected)."""
    try:
        import usys

        # This version can block - use only when expecting input
        try:
            line = usys.stdin.readline()
            if line and line.strip():
                _process_command_line(line.strip())
        except:
            pass

    except Exception as e:
        print("[PILOT] Blocking command processing error:", e)


def handle_command_direct(command_json_string):
    """
    Handle a command directly without reading from stdin.
    This allows external code to inject commands without blocking I/O.
    """
    try:
        _process_command_line(command_json_string)
    except Exception as e:
        print("[PILOT] Direct command handling error:", e)


def _process_command_line(command_text):
    """Process a single command line."""
    try:
        print("[PILOT] Received command:", command_text)

        # Parse JSON command
        command = json.loads(command_text)
        _execute_command(command)

    except Exception as e:
        print("[PILOT] Command parse/execute error:", e)


async def background_telemetry_task():
    """
    Async task for continuous background telemetry and command processing.
    Runs in parallel with user program using multitask.
    """
    print("[PILOT] Starting parallel telemetry task")

    print(
        "[PILOT] Parallel telemetry active with non-blocking command processing - data every",
        _telemetry_interval_ms,
        "ms",
    )

    # Send initial telemetry
    await send_telemetry()

    try:
        while True:
            # Send telemetry data
            await send_telemetry()

            # Process any available commands (non-blocking with read_input_byte)
            process_commands()

            # Wait for the configured interval (async)
            await wait(_telemetry_interval_ms)

    except KeyboardInterrupt:
        print("[PILOT] Parallel telemetry stopped")
    except Exception as e:
        print("[PILOT] Parallel telemetry error:", e)


def start_parallel_instrumentation():
    """
    Start the instrumentation system in parallel with user program.
    This runs telemetry and command processing without interfering with user loops.

    Call this once at the beginning of your program after registering hardware.
    """
    print("[PILOT] Starting parallel instrumentation")

    # For MicroPython/Pybricks, we'll use a simple approach:
    # The telemetry will be sent whenever send_telemetry() is called
    # Commands will be processed when process_commands() is called
    # But we won't modify the user's code structure

    print("[PILOT] Instrumentation active - call send_telemetry() periodically")


async def run_with_parallel_instrumentation(user_main_function):
    """
    Run user's program in parallel with telemetry and command processing.
    Uses Pybricks multitask to run both tasks concurrently.

    Example:
        async def my_program():
            # All your robot code here
            for i in range(10):
                robot.drive(100, 0)
                await wait(1000)  # Use await with async

        await run_with_parallel_instrumentation(my_program)
    """
    print("[PILOT] Running program with parallel instrumentation")

    try:
        # Create the user program task
        async def user_task():
            try:
                print("[PILOT] Starting user program task")
                await user_main_function()
                print("[PILOT] User program task completed")
            except Exception as e:
                print("[PILOT] User program error:", e)
                raise

        # Run both tasks in parallel using multitask
        print("[PILOT] Starting parallel execution: user program + telemetry")
        await multitask(background_telemetry_task(), user_task())

    except KeyboardInterrupt:
        print("[PILOT] Program interrupted")
    except Exception as e:
        print("[PILOT] Parallel execution error:", e)
    finally:
        print("[PILOT] Parallel instrumentation terminated")


def run_with_instrumentation(user_main_function):
    """
    Run user's complete program with automatic instrumentation.
    Legacy function for backwards compatibility.
    """
    # Convert sync function to async if needed
    if (
        hasattr(user_main_function, "__code__")
        and user_main_function.__code__.co_flags & 0x80
    ):
        # Function is already async
        return run_task(run_with_parallel_instrumentation(user_main_function))
    else:
        # Convert sync function to async
        async def async_wrapper():
            user_main_function()

        return run_task(run_with_parallel_instrumentation(async_wrapper))


# Convenience functions for quick setup
def setup_basic_robot(hub, left_motor, right_motor, drivebase=None):
    """Quick setup for a basic robot with hub and two motors."""
    register_hub(hub)
    register_motor("left", left_motor)
    register_motor("right", right_motor)
    if drivebase:
        register_drivebase(drivebase)
    print("[PILOT] Basic robot setup complete")


def setup_advanced_robot(hub, motors_dict, sensors_dict, drivebase=None, gyro=None):
    """Advanced setup with multiple motors and sensors."""
    register_hub(hub)

    for name, motor in motors_dict.items():
        register_motor(name, motor)

    for name, sensor in sensors_dict.items():
        register_sensor(name, sensor)

    if drivebase:
        register_drivebase(drivebase)

    if gyro:
        register_gyro(gyro)

    print("[PILOT] Advanced robot setup complete")


# Add automatic telemetry injection for common patterns
def auto_send_telemetry():
    """
    Convenience function that sends telemetry and can be called frequently.
    This is designed to be called periodically by instrumented code.
    """
    send_telemetry()
    process_commands()  # Now non-blocking with read_input_byte


# Auto-initialization message
print("[PILOT] PybricksPilot module loaded - Ready for instrumentation")
