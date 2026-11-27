# Credits

| What | From | Licence | Where |
|---|---|---|---|
| Tyre force against slip | H. B. Pacejka and E. Bakker, "The Magic Formula tyre model", Vehicle System Dynamics 21 sup. 1 (1992) 1; H. B. Pacejka, *Tyre and Vehicle Dynamics* | formula | `src/tyre.js` |
| Steady cornering, understeer gradient | the linear single-track (bicycle) model, as in W. F. Milliken and D. L. Milliken, *Race Car Vehicle Dynamics* (1995) | formula | `tools/make_reference.mjs` |
| Steering the built-in driver by heading and cross-track error | G. M. Hoffmann, C. J. Tomlin, M. Montemerlo and S. Thrun, "Autonomous automobile trajectory tracking for off-road driving", American Control Conference (2007) | method | `src/driver.js` |
| 3D drawing | three.js r170 | MIT | `web/vendor/` (`three-LICENSE.txt`) |

The car, its livery and every number describing it, and the circuit, are made up for this project. The car and
the circuit are drawn by this project's own code; textures are drawn on a canvas when the page loads, and the
sound is synthesised in the browser. No photographs, 3D models, fonts or recordings are used.

Every file in this repository is under the MIT licence: this project's code and the vendored three.js. The
formulas above are used as published methods.
