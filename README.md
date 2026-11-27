# Slipstream

A racing car simulator you drive from the cockpit or from behind: one modern open-wheel single-seater on one
circuit, in the browser. Both are made up. No AI, no photographs, no recorded sounds, nothing learned.

**The core is the vehicle engine** (`src/vehicle.js`, `src/tyre.js`, `src/car.js`). It is stepped 1,000 times a
second, in the page and in the tests alike. Everything else on the page, the circuit you see, the cameras and
the sound, is there to show what it computes.

**Scale.** One car: 798 kg with the driver, about 750 kW, 3.6 m wheelbase, eight gears, 0 to 352 km/h. The body
moves in the plane (forward, sideways, yaw); each of the four wheels has its own spin, load, slip ratio and slip
angle. One circuit: 4,326 m, 13 m of asphalt, sampled every 2 m, flat. A flying lap takes about 57.6 s.

**The bar.** `npm test` holds the engine to the reference tables in `test/reference/`, each with a stated
tolerance. The first three are worked out on paper from the car's numbers by `tools/make_reference.mjs`,
without running the engine:

| table | what the engine must match | tolerance |
|---|---|---|
| `coast-down.json` | speed while coasting in neutral from 300 and 150 km/h, 60 points, against the closed-form solution with drag, rolling resistance under downforce, and the wheels' spin | 0.05 % of the start speed |
| `top-speed.json` | the speed it settles at flat out in seventh and in eighth, against the steady-state balance of engine push, drag and rolling resistance, with the rear tyres' slip | 0.3 km/h |
| `yaw-gain.json` | steady yaw rate for a small steering angle at 72, 144, 216 and 288 km/h, against the linear bicycle model with the limited-slip differential | 0.5 % |
| `baseline.json` | 0 to 100, 200 and 300 km/h; braking from 300 to 100 km/h; the planned lap; a flying lap by the built-in driver; all recorded from this engine | 1 % |

The last one is a regression baseline: it fails if a change moves the car. Re-record it on purpose with
`node tools/baseline.mjs --record`.

## Run it

```bash
python3 -m http.server 8794
```

Open <http://localhost:8794/web/>. **Drive** puts you on the grid in the cockpit; wait for the five red lights
to go out. **Watch a lap** lets the built-in driver take it round.

| | |
|---|---|
| throttle, brake, steer | W S A D or the arrow keys, or a gamepad (right trigger, left trigger, left stick) |
| gears | E up, Q down (or the bumpers). Shifting by hand turns off the automatic box; G turns it back on |
| camera | C: cockpit, onboard (above the airbox), chase, trackside |
| aids | T traction control, B ABS |
| back on track | R |
| let it drive | P |
| racing line, sound, pause | L, M, Esc |

Traction control and ABS start on, because keys are only on or off. Real cars of this class race without them;
switch them off once you have the feel, or use a gamepad. Without traction control, full throttle out of a slow
corner spins the car, as it would.

It needs no graphics card. Without one, the browser draws in software, so the page draws fewer pixels when
frames come slowly.

Tests and the accuracy check need Node 22, and nothing else:

```bash
npm test
node tools/eval.mjs
```

## How it works

1. **The tyre** (`src/tyre.js`). Pacejka's Magic Formula for force against slip ratio and against slip angle,
   peaking near 0.11 and near 7.8 degrees. Peak grip is 1.75 at 4 kN and falls as the load rises, so a tyre
   with twice the load gives less than twice the grip. Asked to brake or drive and turn at once, the two forces
   share one friction ellipse.
2. **Loads** (`src/vehicle.js`). Static weight (45.5 % on the front), downforce growing with the square of
   speed (42 % of it on the front), and weight moved forward, back and across by the car's own acceleration
   through the height of its centre of gravity, split between the axles by roll stiffness. At 300 km/h the
   downforce is more than twice the car's weight.
3. **The engine and driveline** (`src/car.js`, `src/vehicle.js`). A torque curve to 15,000 rpm, eight gears, a
   clutch that slips at the start, a rev limiter, engine braking, a limited-slip differential between the rear
   wheels, and a 40 ms cut in drive at each shift. The automatic box shifts by road speed, so wheelspin does not
   make it hunt.
4. **The step** (`src/vehicle.js`). Each millisecond: the force at each tyre from its slip and load, turned
   through the steering, summed into the forces and yaw moment on the body, plus drag and rolling resistance.
   Each wheel's spin is stepped implicitly in the tyre's own stiffness, with the car's change of speed over
   the step taken into account, so it is stable at rest and does not make the wheels seem heavier than they
   are. The coast-down table is what caught that.
5. **The circuit** (`src/track.js`). Straights and constant-radius corners, laid out like a surveyor's
   description, with the curvature eased so every corner has a transition. Two straights are sized by a
   direct solve so the lap closes exactly. Under each wheel: asphalt, kerb (a little less grip) or grass (half
   the grip, far more drag). Barriers 22 m from the centre line stop a car that reaches them.
6. **The racing line and the lap planner** (`src/line.js`, `src/lapsim.js`). The line is found by pulling a band
   tight inside the track edges. The planner is a separate, simpler model of the same car, a point with the
   same tyres, loads, engine and brakes, that gives the fastest speed at each point of the line, with no
   stepping in time.
7. **The built-in driver** (`src/driver.js`). A feedback controller, nothing learned: it steers by the line's
   curvature a moment ahead, corrected for its heading and for how far the front of the car is off the line,
   and chases the planned speed a moment ahead. It drives the full engine with the same pedals and wheel you
   have, so its lap is a test of the whole engine.
8. **Aids** (`src/assists.js`). Traction control and ABS hold the worst tyre's combined slip (slip ratio and
   slip angle, each as a share of its peak) near 85 %, by trimming the pedal every step.

The page (`web/`) draws the car and circuit with three.js, from the same centre line the engine drives on. The
cockpit camera sits at the driver's eyes, behind the halo and the steering wheel, and the driver's head moves
with the g-forces. The engine note is made from the firing frequency of a six-cylinder engine at the engine's
own rpm; the tyres scrub when they slip; the kerbs rumble.

## How faithful it is

`tools/eval.mjs` checks the engine against answers known in advance, and reports what the car does:

| check | result |
|---|---|
| Coasting in neutral vs the exact solution, worst of 60 points | 0.0015 % of the start speed |
| Flat out in seventh / eighth vs the steady-state balance (347.09 / 351.96 km/h) | 0.004 / 0.002 km/h apart |
| Yaw rate vs the bicycle model at 72 / 144 / 216 / 288 km/h | -0.07 / -0.06 / +0.06 / +0.16 % |
| 0 to 100 / 200 / 300 km/h, traction control on | 2.52 / 4.82 / 9.02 s |
| 300 to 100 km/h, ABS on | 87.7 m in 1.74 s, peaking at 5.6 g |
| Most cornering grip at 100 / 200 / 300 km/h | 2.2 / 3.3 / 4.9 g |
| Planned lap; flying lap by the built-in driver on the full engine | 55.40 s; 57.59 s, 4.0 % slower |

These are the right size for this class of car: about 2.6 s to 100 km/h, about 5 g under braking and in fast
corners, about 350 km/h flat out. They are not matched to any real car, and the car's numbers were chosen to be
typical, not measured.

The lap planner leaves out the tyres' slip, the time it takes to turn in and the gear shifts, and the built-in
driver leaves a little in hand, so the driven lap is slower than the plan; the test only asks that it be within
5 % and never faster.

The circuit is fast: it averages 268 km/h on a flying lap, about what the fastest real circuits average.

## Not done yet

The engine first:

- **Slipstream.** There is one car, so there is no slipstream to drive in yet. Drag should fall behind another
  car, and downforce with it.
- **Suspension.** Weight moves with a 20 ms lag instead of through springs and dampers. The body does not
  pitch, roll or heave, and ride height does not change the downforce, which on a real car of this kind it
  does strongly.
- **Tyres** have no temperature, wear or pressure, no camber, and no relaxation length: force follows slip
  at once.
- **Aerodynamics** are two constant numbers. No drag-reduction flap, no wake, no yaw sensitivity.
- **The power unit** is one torque curve: no hybrid deployment, no fuel load burning off.
- **The circuit is flat.** No elevation, camber or bumps; kerbs change the grip but have no height.
- **Brakes** have a fixed bias and no temperature.
- **Collisions.** A barrier stops the car and keeps 30 % of its speed along the wall.
- **Steering** has no self-aligning torque, so there is nothing for force feedback to use.

Then the rest:

- **Mirrors** show nothing.
- **Other cars**, and so racing.
- **Steering wheels and pedals**, and force feedback.
- **Replays and a ghost** of your best lap.
- **Weather.**

## Layout

- `src/` the engine (`vehicle.js`, `tyre.js`, `car.js`) and the world round it (`track.js`, `line.js`,
  `lapsim.js`, `driver.js`, `assists.js`), plain ES modules shared by the page and Node
- `web/` the page: `index.html`, `app.js` (loop, cameras, timing, display), `world.js` (the circuit you see),
  `car-model.js` (the car's shape), `sound.js`, `input.js`, `style.css`, vendored three.js
- `tools/` the reference tables, the regression baseline, the accuracy check
- `test/` `node --test`; `test/reference/` the tables the engine is held to

Licence: MIT ([LICENSE](LICENSE)). Credits: [CREDITS.md](CREDITS.md).
