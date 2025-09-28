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
import math
import ujson as json

from pybricks.tools import StopWatch
from pybricks.tools import read_input_byte
from pybricks.tools import run_task, multitask, wait
from pybricks.parameters import Color, Button, Stop

_stopwatch = None


def get_time_ms():
    global _stopwatch
    if _stopwatch is None:
        _stopwatch = StopWatch()
    return _stopwatch.time()


# Global registry for hardware components
_hub = None
_motors = {}
_sensors = {}
_drivebase = None
_gyro_sensor = None

# Pseudo program helpers
_pseudo_heading_reference = None

# Telemetry configuration
_telemetry_enabled = True
_telemetry_interval_ms = 100  # Send telemetry every 100ms
_last_telemetry_time = 0
# Command buffer for non-blocking input processing
_command_buffer = ""

# Hub menu state management
_menu_programs = []  # List of program dictionaries
_menu_current_index = 0
_menu_active = False
_menu_state = "idle"  # idle, menu, running
_menu_last_button_time = 0
_menu_button_debounce_ms = 300
_menu_run_requested = False  # Flag for UI-requested program run


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


async def _execute_command_sequence(commands):
    """Execute a sequence of commands with appropriate stop behavior.

    All commands except the last use Stop.COAST_SMART for smooth transitions.
    The last command uses Stop.HOLD for precise final positioning.
    """
    try:
        print(f"[PILOT] Executing command sequence of {len(commands)} commands")

        for i, cmd in enumerate(commands):
            is_last_command = i == len(commands) - 1

            # Add stop behavior to command based on position in sequence
            if "action" in cmd and cmd["action"] in ["drive", "turn", "arc"]:
                # Clone the command to avoid modifying the original
                cmd_with_stop = cmd.copy()
                if is_last_command:
                    cmd_with_stop["stop_behavior"] = "hold"
                    print(
                        f"[PILOT] Executing final command {i+1}/{len(commands)} with HOLD"
                    )
                else:
                    cmd_with_stop["stop_behavior"] = "coast_smart"
                    print(
                        f"[PILOT] Executing command {i+1}/{len(commands)} with COAST_SMART"
                    )

                # Execute the individual command with stop behavior
                await _execute_single_command(cmd_with_stop)
            else:
                # For non-movement commands, execute normally
                print(f"[PILOT] Executing non-movement command {i+1}/{len(commands)}")
                await _execute_single_command(cmd)

        print("[PILOT] Command sequence completed")

    except Exception as e:
        print("[PILOT] Command sequence error:", e)


async def _execute_command(command):
    """Execute a received command or command sequence."""
    if command is None:
        return
    
    try:
        # Check if this is a command sequence (array of commands)
        if isinstance(command, list):
            await _execute_command_sequence(command)
            return

        # Single command - execute directly
        await _execute_single_command(command)

    except Exception as e:
        print("[PILOT] Command execution error:", e)


async def _execute_single_command(command):
    """Execute a single command with optional stop behavior."""
    try:
        action = command.get("action")
        stop_behavior = command.get(
            "stop_behavior", "hold"
        )  # Default to hold for single commands

        # Debug: Print drivebase status for troubleshooting
        if action in ["drive", "turn", "arc", "stop"]:
            print(
                "[PILOT] Command:",
                action,
                "- Drivebase registered:",
                _drivebase is not None,
                "- Stop behavior:",
                stop_behavior,
            )

        if action == "drive" and _drivebase:
            # Drive command: {"action": "drive", "distance": 100, "speed": 200, "stop_behavior": "hold"}
            distance = command.get("distance", 0)
            speed = command.get("speed", 100)

            # Convert stop behavior string to Pybricks Stop parameter
            stop_param = Stop.HOLD  # Default
            if stop_behavior == "coast_smart":
                stop_param = Stop.COAST_SMART
            elif stop_behavior == "coast":
                stop_param = Stop.COAST
            elif stop_behavior == "brake":
                stop_param = Stop.BRAKE

            # Use straight() method with appropriate stop behavior
            _drivebase.settings(straight_speed=speed)
            await _drivebase.straight(distance, then=stop_param, wait=True)
            print(
                "[PILOT] Executed drive:",
                distance,
                "mm at",
                speed,
                "mm/s with",
                stop_behavior,
            )

        elif action == "turn" and _drivebase:
            # Turn command: {"action": "turn", "angle": 90, "speed": 100, "stop_behavior": "hold"}
            angle = command.get("angle", 0)
            speed = command.get("speed", 100)

            # Convert stop behavior string to Pybricks Stop parameter
            stop_param = Stop.HOLD  # Default
            if stop_behavior == "coast_smart":
                stop_param = Stop.COAST_SMART
            elif stop_behavior == "coast":
                stop_param = Stop.COAST
            elif stop_behavior == "brake":
                stop_param = Stop.BRAKE

            # Use turn() method with appropriate stop behavior
            _drivebase.settings(turn_rate=speed)
            await _drivebase.turn(angle, then=stop_param, wait=True)
            print(
                "[PILOT] Executed turn:",
                angle,
                "° at",
                speed,
                "°/s with",
                stop_behavior,
            )

        elif action == "stop":
            # Stop command: {"action": "stop"} or {"action": "stop", "motor": "motor_name"}
            motor_name = command.get("motor")
            if motor_name and motor_name in _motors:
                # Stop specific motor
                motor = _motors[motor_name]
                await motor.stop()
                print("[PILOT] Stopped motor '" + motor_name + "'")
            elif _drivebase:
                await _drivebase.stop()
                print("[PILOT] Executed stop")

        elif action == "drive_continuous" and _drivebase:
            # Continuous drive command: {"action": "drive_continuous", "speed": 100, "turn_rate": 0}
            speed = command.get("speed", 0)
            turn_rate = command.get("turn_rate", 0)
            # Use drive() method for continuous movement
            await _drivebase.drive(speed, turn_rate)
            print("[PILOT] Continuous drive:", speed, "mm/s, turn:", turn_rate, "°/s")

        elif action == "turn_and_drive" and _drivebase:
            # Turn and drive command: {"action": "turn_and_drive", "angle": 90, "distance": 100, "speed": 200}
            angle = command.get("angle", 0)
            distance = command.get("distance", 0)
            speed = command.get("speed", 100)

            # Convert stop behavior string to Pybricks Stop parameter
            stop_param = Stop.HOLD  # Default
            stop_behavior = command.get("stop_behavior", "hold")
            if stop_behavior == "coast_smart":
                stop_param = Stop.COAST_SMART
            elif stop_behavior == "coast":
                stop_param = Stop.COAST
            elif stop_behavior == "brake":
                stop_param = Stop.BRAKE

            # Execute turn first, then drive
            if angle != 0:
                _drivebase.settings(turn_rate=speed)
                await _drivebase.turn(angle, then=Stop.COAST_SMART, wait=True)
                
            if distance != 0:
                _drivebase.settings(straight_speed=speed)
                await _drivebase.straight(distance, then=stop_param, wait=True)
                
            print(
                "[PILOT] Executed turn_and_drive:",
                angle,
                "° then",
                distance,
                "mm at",
                speed,
                "units/s with",
                stop_behavior,
            )

        elif action == "arc" and _drivebase:
            # Arc command: {"action": "arc", "radius": 100, "angle": 90, "speed": 200}
            # Use Pybricks drivebase arc method for smooth curved movement
            radius = command.get("radius", 100)
            angle = command.get("angle")
            speed = command.get("speed", 100)

            # For mission planning, we might get startAngle/endAngle instead of angle
            start_angle = command.get("startAngle")
            end_angle = command.get("endAngle")

            if angle is None and start_angle is not None and end_angle is not None:
                # Calculate sweep angle from start/end angles
                angle = end_angle - start_angle
                # Normalize to [-180, 180] range
                while angle > 180:
                    angle -= 360
                while angle < -180:
                    angle += 360

            if angle is not None:
                # Convert stop behavior string to Pybricks Stop parameter
                stop_param = Stop.HOLD  # Default for arcs
                stop_behavior = command.get("stop_behavior", "hold")
                if stop_behavior == "coast_smart":
                    stop_param = Stop.COAST_SMART
                elif stop_behavior == "coast":
                    stop_param = Stop.COAST
                elif stop_behavior == "brake":
                    stop_param = Stop.BRAKE

                # Use Pybricks drivebase arc method
                _drivebase.settings(straight_speed=speed)
                if hasattr(_drivebase, "arc"):
                    await _drivebase.arc(radius, angle, then=stop_param, wait=True)
                else:
                    await _drivebase.curve(radius, angle, then=stop_param, wait=True)
            else:
                print("[PILOT] Arc command missing angle parameter")

        elif action == "motor":
            # Motor command: {"action": "motor", "motor": "left", "angle": 90, "speed": 100}
            # Also support: {"action": "motor", "port": "A", "speed": 100}
            motor_name = command.get("motor") or command.get("port")
            if motor_name and motor_name in _motors:
                motor = _motors[motor_name]
                angle = command.get("angle")
                speed = command.get("speed", 100)

                if angle is not None:
                    await motor.run_angle(speed, angle)
                    print(
                        "[PILOT] Motor '" + motor_name + "':",
                        angle,
                        "° at",
                        speed,
                        "°/s",
                    )
                else:
                    # Continuous run
                    await motor.run(speed)
                    print(
                        "[PILOT] Motor '" + motor_name + "': running at", speed, "°/s"
                    )
            else:
                print("[PILOT] Unknown motor:", motor_name)

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
                _hub.imu.reset_heading(0)
                print("[PILOT] Drivebase telemetry reset - distance and angle set to 0")
            except Exception as e:
                print("[PILOT] Drivebase reset error:", e)

        elif action == "select_program" and _menu_active:
            # Select a specific program in the menu: {"action": "select_program", "program_number": 1}
            program_number = command.get("program_number")
            if program_number:
                for i, prog in enumerate(_menu_programs):
                    if prog["num"] == program_number:
                        _menu_current_index = i
                        if _hub:
                            _hub.display.number(prog["num"])
                        print("[PILOT:MENU] UI selected:", prog["name"])
                        _send_menu_status()
                        break

        elif action == "run_selected" and _menu_active and _menu_state == "menu":
            # Run the currently selected program: {"action": "run_selected"}
            print("[PILOT:MENU] UI requested run")
            # Note: _run_menu_program is async, we'll need to handle this differently
            # For now, just set a flag that the menu loop can check
            global _menu_run_requested
            _menu_run_requested = True

        else:
            print("[PILOT] Unknown command action:", action)

    except Exception as e:
        print("[PILOT] Command execution error:", e)


async def process_commands():
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
                    await _process_buffered_commands()

            except Exception as e:
                # Error reading byte, stop reading
                break

    except Exception as e:
        print("[PILOT] Command processing error:", e)


async def _process_buffered_commands():
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
                await _process_command_line(command_line)

    except Exception as e:
        print("[PILOT] Buffer processing error:", e)


async def _process_command_line(command_text):
    """Process a single command line."""
    try:
        print("[PILOT] Received command:", command_text)

        # Parse JSON command
        command = json.loads(command_text)
        await _execute_command(command)

    except Exception as e:
        print("[PILOT] Command parse/execute error:", e)


# Hub menu management functions
def init_hub_menu(programs):
    """Initialize the hub menu with a list of programs.

    Args:
        programs: List of program dictionaries with keys:
            - num: Program number to display
            - name: Program name
            - side: Starting side (left/right)
            - main: Callable main function for the program
    """
    global _menu_programs, _menu_current_index, _menu_active, _menu_state, _hub

    _menu_programs = programs
    _menu_current_index = 0
    _menu_active = True
    _menu_state = "menu"

    if _hub:
        # Set stop button to Bluetooth to free up CENTER for selection
        _hub.system.set_stop_button(Button.BLUETOOTH)
        # Set hub light to green for menu mode
        _hub.light.on(Color.GREEN)
        # Display initial program number
        if programs:
            _hub.display.number(1)

    print("[PILOT:MENU] Initialized with", len(programs), "programs")
    _send_menu_status()


def _send_menu_status():
    """Send hub menu status to UI."""
    global _menu_programs, _menu_current_index, _menu_state

    if _menu_programs and _menu_current_index < len(_menu_programs):
        current = _menu_programs[_menu_current_index]
        print(
            "[PILOT:MENU_STATUS] selected={} total={} state={}".format(
                current["num"], len(_menu_programs), _menu_state
            )
        )


def _process_menu_buttons():
    """Process hub button presses for menu navigation."""
    global _hub, _menu_current_index, _menu_last_button_time, _menu_state

    if not _hub or not _menu_active or _menu_state != "menu":
        return

    current_time = get_time_ms()

    # Debounce buttons
    if current_time - _menu_last_button_time < _menu_button_debounce_ms:
        return

    pressed = _hub.buttons.pressed()

    if Button.LEFT in pressed:
        # Previous program
        _menu_current_index = (_menu_current_index - 1) % len(_menu_programs)
        _hub.display.number(_menu_programs[_menu_current_index]["num"])
        print("[PILOT:MENU] Selected:", _menu_programs[_menu_current_index]["name"])
        _send_menu_status()
        _menu_last_button_time = current_time

    elif Button.RIGHT in pressed:
        # Next program
        _menu_current_index = (_menu_current_index + 1) % len(_menu_programs)
        _hub.display.number(_menu_programs[_menu_current_index]["num"])
        print("[PILOT:MENU] Selected:", _menu_programs[_menu_current_index]["name"])
        _send_menu_status()
        _menu_last_button_time = current_time

    elif Button.CENTER in pressed:
        # Run selected program - set flag for async handler
        global _menu_run_requested
        _menu_run_requested = True
        _menu_last_button_time = current_time


async def _run_menu_program():
    """Run the currently selected menu program."""
    global _menu_state, _menu_current_index, _hub

    if not _menu_programs or _menu_current_index >= len(_menu_programs):
        return

    selected = _menu_programs[_menu_current_index]
    _menu_state = "running"

    # Apply the program's configured position
    position = selected.get("position")
    if position:
        print(
            "[PILOT:SET_POSITION]",
            json.dumps(
                {
                    "side": position["side"],
                    "fromBottom": position["fromBottom"],
                    "fromSide": position["fromSide"],
                    "heading": position["heading"],
                }
            ),
        )
        print(
            "[PILOT:MENU] Setting robot position:",
            position["side"],
            "side,",
            position["fromBottom"],
            "mm from bottom,",
            position["fromSide"],
            "mm from side,",
            position["heading"],
            "° heading",
        )
    else:
        # Fallback to legacy position reset
        print("[PILOT:POSITION_RESET]")
        print("[PILOT:MENU] Using default position reset")

    print("[PILOT:MENU] Starting Program", selected["num"], ":", selected["name"])
    print("[PILOT:MENU] Starting side:", selected["side"])
    _send_menu_status()

    if _hub:
        await _hub.speaker.beep(frequency=660, duration=200)
        _hub.light.on(Color.RED)

    try:
        # Run the program's main function with telemetry
        await selected["main"]()
        print("[PILOT:MENU] Program", selected["num"], "completed successfully")
    except Exception as e:
        print("[PILOT:MENU] Program error:", e)
        if _hub:
            _hub.display.text("ERR")
            wait(2000)

    # Return to menu state
    _menu_state = "menu"

    # Auto-advance to next program
    _menu_current_index = (_menu_current_index + 1) % len(_menu_programs)

    if _hub:
        _hub.light.on(Color.GREEN)
        _hub.display.number(_menu_programs[_menu_current_index]["num"])

    print("[PILOT:MENU] Returned to menu")
    print("[PILOT:MENU] Auto-advanced to:", _menu_programs[_menu_current_index]["name"])
    _send_menu_status()


async def process_menu_commands():
    """Process both button presses and UI commands for menu control.
    This should be called in the main loop when menu is active."""

    global _menu_run_requested

    if not _menu_active:
        return

    # Process hub button presses
    _process_menu_buttons()

    # Process UI commands through existing command system
    await process_commands()

    # Check if UI requested a program run
    if _menu_run_requested and _menu_state == "menu":
        _menu_run_requested = False
        # Return True to signal that a program should be run
        return True

    return False


async def run_hub_menu():
    """Main hub menu loop that handles program selection and execution."""
    global _menu_active, _menu_state

    if not _menu_active or not _menu_programs:
        print("[PILOT:MENU] Menu not initialized or no programs available")
        return

    print("[PILOT:MENU] Starting menu loop")

    while _menu_active:
        if _menu_state == "menu":
            # Process commands (buttons and UI)
            should_run = await process_menu_commands()

            if should_run:
                # Run the selected program
                await _run_menu_program()

        # Small delay to prevent busy looping
        await wait(50)


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

    try:
        while True:
            # Send telemetry data
            await send_telemetry()

            # Wait for the configured interval (async)
            await wait(_telemetry_interval_ms)
    except KeyboardInterrupt:
        print("[PILOT] Parallel telemetry stopped")
    except Exception as e:
        print("[PILOT] Parallel telemetry error:", e)


def send_position_reset():
    """Send a position reset command to the browser to reset robot to start position."""
    try:
        # Send a special telemetry command to reset position
        print("[PILOT:POSITION_RESET]")
        print("[PILOT] Position reset command sent to browser")
    except Exception as e:
        print("[PILOT] Position reset send error:", e)


# ---------------------------------------------------------------------------
# Generated pseudo program helpers
# ---------------------------------------------------------------------------


def _ensure_drivebase():
    if _drivebase is None:
        raise RuntimeError(
            "[PILOT] Drivebase is not registered. Import robot.py or register it manually."
        )


def _resolve_stop_behavior(stop_behavior):
    behavior = (stop_behavior or "hold").lower()
    if behavior in ["coast_smart", "smart", "coast-smart"]:
        return Stop.COAST_SMART
    if behavior == "coast":
        return Stop.COAST
    if behavior == "brake":
        return Stop.BRAKE
    return Stop.HOLD


def _read_raw_heading():
    if _gyro_sensor is None:
        return None

    try:
        if hasattr(_gyro_sensor, "angle"):
            return float(_gyro_sensor.angle())
        if hasattr(_gyro_sensor, "heading"):
            return float(_gyro_sensor.heading())
    except Exception as e:
        print("[PILOT] Failed to read gyro heading:", e)
    return None


def _normalize_heading(angle):
    if angle is None:
        return None
    normalized = float(angle)
    while normalized <= -180:
        normalized += 360
    while normalized > 180:
        normalized -= 360
    return normalized


def reset_heading_reference():
    """Capture the current gyro heading as the 0° reference for pseudo programs."""

    global _pseudo_heading_reference
    raw = _read_raw_heading()
    if raw is None:
        _pseudo_heading_reference = None
        print("[PILOT] Warning: No gyro available; turn_to_heading will use relative turns")
        return

    _pseudo_heading_reference = raw
    print("[PILOT] Heading reference reset to", _normalize_heading(0))


def get_relative_heading():
    """Return the current heading relative to the stored reference."""

    raw = _read_raw_heading()
    if raw is None:
        return None

    if _pseudo_heading_reference is None:
        return _normalize_heading(raw)

    return _normalize_heading(raw - _pseudo_heading_reference)


async def drive_straight(distance_mm, speed=None, stop_behavior="hold"):
    """Drive straight for the requested distance in millimeters."""

    _ensure_drivebase()

    try:
        distance = float(distance_mm)
    except Exception:
        raise ValueError("drive_straight distance must be numeric")

    if speed is not None:
        try:
            _drivebase.settings(straight_speed=float(speed))
        except Exception as e:
            print("[PILOT] Failed to set straight speed:", e)

    await _drivebase.straight(distance, then=_resolve_stop_behavior(stop_behavior), wait=True)
    print("[PILOT] drive_straight completed:", distance, "mm")


async def drive_arc(radius_mm, angle_deg, speed=None, stop_behavior="hold"):
    """Drive an arc with the provided radius (mm) and angle (deg)."""

    _ensure_drivebase()

    try:
        radius = float(radius_mm)
        angle = float(angle_deg)
    except Exception:
        raise ValueError("drive_arc radius and angle must be numeric")

    if speed is not None:
        try:
            _drivebase.settings(straight_speed=float(speed))
        except Exception as e:
            print("[PILOT] Failed to set straight speed for arc:", e)

    await _drivebase.curve(radius, angle, then=_resolve_stop_behavior(stop_behavior), wait=True)
    print(
        "[PILOT] drive_arc completed: radius=",
        radius,
        "angle=",
        angle,
        "deg",
    )


async def turn_to_heading(target_heading_deg, speed=90, tolerance=1.0, stop_behavior="hold"):
    """Turn the robot to an absolute heading in degrees (-180..180)."""

    _ensure_drivebase()

    try:
        target = float(target_heading_deg)
    except Exception:
        raise ValueError("turn_to_heading target must be numeric")

    if speed is not None:
        try:
            _drivebase.settings(turn_rate=float(speed))
        except Exception as e:
            print("[PILOT] Failed to set turn rate:", e)

    relative_heading = get_relative_heading()

    if relative_heading is None:
        # No gyro available: fallback to simple relative turn
        print(
            "[PILOT] turn_to_heading using relative turn (no gyro). Target=",
            target,
        )
        await _drivebase.turn(target, then=_resolve_stop_behavior(stop_behavior), wait=True)
        return _normalize_heading(target)

    # Initialize heading reference on first call if needed
    if _pseudo_heading_reference is None:
        reset_heading_reference()
        relative_heading = get_relative_heading()
        if relative_heading is None:
            print(
                "[PILOT] Warning: Could not establish heading reference; using relative turn",
            )
            await _drivebase.turn(target, then=_resolve_stop_behavior(stop_behavior), wait=True)
            return _normalize_heading(target)

    # Compute difference and normalize to shortest direction
    delta = _normalize_heading(target - relative_heading)

    if math.fabs(delta) <= float(tolerance):
        print("[PILOT] Already within heading tolerance:", relative_heading)
        return relative_heading

    await _drivebase.turn(delta, then=_resolve_stop_behavior(stop_behavior), wait=True)
    new_heading = get_relative_heading()
    print("[PILOT] turn_to_heading completed. Final heading:", new_heading)
    return new_heading


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
