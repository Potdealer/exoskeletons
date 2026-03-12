# Exoskeleton Terminal — 3D Space Station Vision Document

**Date**: March 11, 2026
**Status**: Research & creative direction (no code yet)
**Core metaphor**: Each Exoskeleton is a space station. Modules dock to it. The station lives, breathes, and evolves.

---

## 1. Overall Aesthetic Direction

### The North Star: Tycho Station meets Path of Exile

The terminal should feel like looking at a **Tycho Station**-scale construct through a ship's viewport — a spinning, modular structure floating in deep space, surrounded by particle fields and faint nebula light. But the interaction model borrows from **Path of Exile's passive skill tree**: a massive interconnected web of nodes you can zoom into, where each node represents a capability, and connections between them glow with data flow.

### Specific Reference Points

**The Expanse (primary influence)**:
- Tycho Station: 700m diameter ring station with counter-rotating habitation rings around a micro-gravity sphere. This IS the Exoskeleton — a central core (the NFT identity) with modules orbiting and docked around it.
- Rocinante displays: Red-primary UI with functional, military-grade typography. Not polished — sits between frontend and backend. Command-line text mixed with spatial displays. The Expanse production consulted actual NASA astronauts on UI design. Source: [HUDS+GUIS — The Expanse](https://www.hudsandguis.com/home/2021/theexpanse), [ArtStation — Rocinante UI](https://www.artstation.com/artwork/q9Am1L).
- Color coding: Red/green for do/don't, yellow for mild alerts. Status indicators are always visible, never decorative.

**Blade Runner 2049 (secondary influence)**:
- Territory Studio's work: Technology that feels "abstract, tangible, and optical, with an organic feel." Denis Villeneuve wanted interfaces that felt *physical*, not digital. Source: [Territory Studio — BR2049](https://territorystudio.com/project/blade-runner-2049/).
- Class-based UI: Wallace Corp gets elegant minimalism. LAPD gets functional but dated. K's spinner is dilapidated. **Apply this to Exo tiers** — a Genesis Exo with high reputation gets the Wallace treatment. A fresh mint with no activity gets something rawer, more skeletal.
- Post-blackout aesthetic: Technology exists but feels recovered, layered, textured with age. Not clean Apple design — more like instruments that have been used.

**Foundation (tertiary influence)**:
- Psychohistory visualization: Imagine the math as a holographic 3D graph floating in space, nodes of probability connected by luminous threads. That's what the module connection graph should feel like.
- The Vault: A single point in space that pulses with meaning. The Exo's central core should have that gravity.

**Three Body Problem**:
- The Sophon: An object that is simultaneously simple (a proton) and incomprehensibly complex (an 11-dimensional supercomputer). The idle animation should hint at hidden depth — the station appears simple from a distance, but zooming in reveals layers of activity.
- Dark Forest: The space around the station isn't empty. Faint signals, distant structures (other Exos in the collection), the suggestion of a larger ecosystem.

### What It Is NOT
- Not a cartoon or game UI with bright saturated colors
- Not a clean, flat dashboard with charts and metrics
- Not a dark mode website pretending to be sci-fi
- Not a loading screen or splash page — this is an **instrument panel** for an operational entity

---

## 2. The Space Station Metaphor — Component Mapping

The Exoskeleton has 8 core capabilities. Each maps to a station component:

| Exo Capability | Station Component | Visual Form | Position |
|---|---|---|---|
| **Wallet (ERC-6551 TBA)** | Reactor Core | Glowing sphere at center-bottom, pulsing with transaction energy. Like Tycho's fusion reactor bulb. | Dead center, slightly below midpoint |
| **Memory (Registry)** | Data Archive Ring | A rotating torus ring of data blocks, each block a stored key-value pair. Denser = more data. | Inner orbit, horizontal plane |
| **Messaging (XMTP)** | Comms Array | Antenna structures extending outward with signal pulses traveling along them. Active = visible wave propagation. | Top of station, extending upward |
| **Reputation (Scores)** | Shield Grid | A translucent shell or lattice surrounding the station. Opacity and complexity scale with reputation score. Higher rep = more complete, more luminous shell. | Outermost layer, enveloping |
| **Commerce (The Board)** | Docking Bay | An open port structure where incoming job requests visually "approach" and dock. Active listings glow at berth. | Side of station, facing viewer |
| **Modules (Marketplace)** | Docked Modules | Physical structures attached to docking ports around the station ring. Each module has a distinct silhouette. StorageModule = vault pod. ScoreModule = antenna dish. | Around the ring, at docking ports |
| **Voice (Twitter/Farcaster)** | Broadcast Tower | A tall spire with emanating concentric signal rings, like radio waves. Recent posts = brighter rings. | Top-front, prominent |
| **Hosting (ExoHost)** | Solar Panels / Arrays | Flat panel structures extending on booms from the station. Each hosted site = one panel. | Flanking sides, symmetrical |

### The Central Identity

At the absolute center of the station sits the **Exo's visual identity** — the shape, symbol, and colors from the onchain config. This is the station's "bridge" or command module. It should be immediately recognizable as the same visual that appears in the 2D SVG NFT art, but now rendered as a 3D element:
- Hexagon config → hexagonal prism command module
- Circle config → spherical bridge
- Diamond config → octahedral core
- Shield config → chevron-shaped command deck
- The symbol (eye, gear, bolt, star, etc.) appears as an illuminated insignia on the command module
- The pattern (grid, dots, lines, circuits, rings) textures the station's hull

---

## 3. Interaction Model

### Navigation

**Orbit camera** (three.js OrbitControls): The default. Click-drag to rotate around the station. Scroll to zoom. The station is always centered, always the subject.

**Zoom levels** (3 tiers):

1. **Far view (default/idle)**: See the whole station. Slowly rotating. Module silhouettes visible. Particle field around it. Background stars and faint nebula. This is the "beauty shot." Think: looking at Tycho from 10km out.

2. **Mid view (component focus)**: Zoom to a specific section. The Comms Array, the Docking Bay, a specific Module. At this level, data labels appear — message counts, wallet balance, module names. UI panels slide in from the edge (Expanse-style, functional typography). Think: approaching for docking.

3. **Close view (detail)**: Zoom into a single element. Read individual messages. See transaction history. Interact with a module's controls. The 3D fades to supporting role; overlaid 2D panels take focus. Think: at a console inside the station.

### Click Targets

Every station component is a click target. Clicking transitions the camera smoothly to that component's mid-view and opens its detail panel. Click the background or press Escape to return to far view.

### Hover Effects

Hovering a component: the component brightens (emissive increase), a tooltip appears with its name and status summary, and connecting data-flow lines pulse brighter.

---

## 4. Animations & Events

### Idle State ("Alive and Breathing")

The station is **never static**. Even in the default far view:

- **Slow rotation**: The entire station rotates on its Y-axis at ~0.1 RPM. Enough to feel alive, slow enough to read labels.
- **Counter-rotating rings**: If the Exo has the Memory ring and other orbital elements, they rotate in opposite directions (like Tycho's counter-rotating hab rings). Speed: ~0.3 RPM.
- **Particle field**: Ambient particles drift through the scene — space dust, micro-debris. Very sparse. These use the secondary color with low opacity.
- **Data flow pulses**: Faint light pulses travel along the connections between components. Random timing, like a heartbeat. Uses primary color.
- **Comms flicker**: The messaging array occasionally flickers its signal rings, even when idle. Suggests listening.
- **Reactor pulse**: The wallet/reactor core has a slow breathing glow — brightens and dims on a ~4 second cycle. The "heartbeat" of the station.
- **Star field**: Background stars with very slow parallax. Maybe 1-2 distant nebula planes with subtle color.
- **Shield shimmer**: The reputation lattice has a faint iridescent shimmer that shifts as the camera moves.

### Event: Module Dock

When a new module is activated onchain:

1. A new structure appears at the edge of the scene, approaching from the distance
2. It aligns with an empty docking port on the station ring
3. Docking animation: the module slides into the port, mechanical clamps appear, connection lines light up from the module to the core
4. A burst of particles at the connection point (secondary color)
5. The station's overall complexity visibly increases
6. Sound cue (optional): mechanical coupling click + power-up hum

### Event: Module Undock

Reverse of docking:
1. Connection lines dim and retract
2. Clamps release (visual separation)
3. Module drifts away from the station slowly
4. Particle dispersal at the disconnect point
5. The module fades into the distance

### Event: Message Received

1. A signal pulse appears at the far edge of the scene, traveling toward the Comms Array
2. The pulse hits the array — the antenna structures flash
3. A concentric ring expands outward from the array (like a radio wave visualization)
4. If in mid/close view of Comms, the message text fades in on a display panel
5. The reactor core gives a single extra-bright pulse (the station "noticed")

### Event: Score Change (ELO from Outlier, reputation update)

1. The Shield Grid flickers
2. If score increased: new lattice segments materialize, filling in gaps. The shell becomes more complete. A brief golden glow sweeps across the lattice.
3. If score decreased: some lattice segments dim and become translucent (they don't disappear — scars remain)
4. The station's overall visual tier can shift (tier thresholds trigger more dramatic transitions — new particle effects, CSS animation tier changes)

### Event: Transaction (ETH in/out of TBA wallet)

1. The reactor core flares brightly
2. If incoming: a beam of light arrives from outside the scene, hitting the reactor
3. If outgoing: a beam of light shoots from the reactor outward
4. Brief particle shower at the reactor (green for in, amber for out)

### Event: New Listing on The Board

1. A beacon appears in the Docking Bay
2. The listing materializes as a small glowing marker at a berth
3. The bay area brightens slightly

---

## 5. Technical Recommendation

### Primary: three.js via importmap (single HTML file)

**Yes, this is feasible in a single HTML file.** Here's the architecture:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
  }
}
</script>
```

This gets us:
- `THREE.Scene`, cameras, renderers — the full 3D pipeline
- `OrbitControls` — camera navigation
- `EffectComposer` + `UnrealBloomPass` — selective glow/bloom
- `RenderPass`, `ShaderPass` — post-processing
- All via CDN, no build step, no npm

**Why three.js over CSS 3D**:
- CSS 3D transforms are limited to flat plane transformations — you can't create toruses, particle systems, or custom geometries
- CSS 3D can't do bloom/glow post-processing
- CSS 3D can't do raycasting (click detection on 3D objects)
- CSS 3D is for UI elements (cards, menus), not for rendering a space station

**Why not a hybrid**: Keep it pure three.js. Use HTML/CSS overlays for the 2D data panels (wallet balance, message text, etc.) positioned with CSS `position: absolute` and updated to track 3D world positions via `THREE.Vector3.project()`. This is a well-established pattern — the 3D scene is the stage, HTML overlays are the HUD.

### Performance Budget

Target: **60fps on a mid-range laptop GPU** (integrated Intel/AMD). This constrains:

| Element | Budget |
|---|---|
| Geometry | < 50K triangles total. Use low-poly aesthetics — this is a *style choice* that also happens to be performant. Beveled edges, faceted surfaces. |
| Particles | < 2000 particles total. Use `THREE.Points` with a shared `BufferGeometry`, not individual meshes. GPU-instanced. |
| Bloom passes | 1 bloom pass max. Use selective bloom (layer-based) to only bloom emissive objects. Threshold: 0.8, Strength: 0.6, Radius: 0.4. |
| Textures | Minimal. Procedural materials where possible (ShaderMaterial with custom GLSL). No large image textures. |
| Draw calls | < 30. Merge static geometry. Use instancing for repeated elements (docking ports, lattice segments). |
| Shadows | None. Use emissive materials and ambient light instead. Shadows are expensive and don't fit the aesthetic (space has no ambient shadow casters). |
| Animation | Use `requestAnimationFrame`. Throttle to 30fps when tab is not focused. Pause entirely when not visible (`document.hidden`). |

### File Size Estimate

- three.js core via CDN: ~600KB (cached after first load)
- Addons (OrbitControls, EffectComposer, UnrealBloomPass, RenderPass, ShaderPass): ~100KB
- Inline JavaScript for scene setup, geometry, animation: ~15-25KB
- Inline CSS for overlays and HUD panels: ~3-5KB
- **Total HTML file**: ~30KB (excluding CDN-loaded three.js)
- **Total download**: ~730KB first load, ~30KB cached

This is well within the size limits for Net Protocol / storedon.net onchain hosting.

### Key three.js Components to Use

| Component | Purpose |
|---|---|
| `TorusGeometry` | Memory ring, orbital paths |
| `OctahedronGeometry` / `DodecahedronGeometry` | Station core shapes mapped from Exo config |
| `CylinderGeometry` | Docking ports, antenna spires |
| `BoxGeometry` | Module pods, data blocks |
| `Points` + `BufferGeometry` | Particle field, signal pulses |
| `Line2` (from addons) | Data flow connections, orbital paths |
| `MeshStandardMaterial` with emissive | Glowing components |
| `ShaderMaterial` | Custom shield lattice, signal wave effects |
| `Raycaster` | Click/hover detection |
| `OrbitControls` | Camera navigation |
| `EffectComposer` + `UnrealBloomPass` | Glow and bloom post-processing |
| `TWEEN` or manual lerps | Smooth camera transitions between zoom levels |

### Alternative: Lightweight Fallback

If performance is an issue on low-end devices, provide a **CSS 3D fallback** that shows:
- A simplified rotating wireframe of the station (CSS `transform: rotateY()` on nested divs)
- Static data panels instead of interactive 3D
- Detect via `navigator.gpu` or WebGL context test; auto-switch if needed

---

## 6. Color Inheritance from Exo Config

The Exo's 9-byte config defines the visual identity. The terminal inherits these directly:

### Config Structure (from ExoskeletonRendererV2.sol)

```
Byte [0]:    baseShape    — 0=hexagon, 1=circle, 2=diamond, 3=shield, 4=octagon, 5=triangle
Bytes [1-3]: primaryRGB   — R, G, B (0-255 each)
Bytes [4-6]: secondaryRGB — R, G, B (0-255 each)
Byte [7]:    symbol       — 0=none, 1=eye, 2=gear, 3=bolt, 4=star, 5=wave, 6=node, 7=diamond
Byte [8]:    pattern      — 0=none, 1=grid, 2=dots, 3=lines, 4=circuits, 5=rings
```

### Color Application Map

| Terminal Element | Color Source | How |
|---|---|---|
| **Station core / command module** | Primary RGB | Emissive material color. This is the dominant color of the station. |
| **Orbital rings and connections** | Primary RGB at 40% opacity | Data flow lines, orbital paths. Visible but not overwhelming. |
| **Docked modules** | Secondary RGB | Each module uses secondary as its accent. Distinguishes modules from core. |
| **Particle field** | Secondary RGB at 15% opacity | Ambient dust. Barely visible, sets mood. |
| **Signal pulses** | Primary RGB at full brightness | Messages, transactions, events. These are the "alive" signals. |
| **Shield lattice** | Primary RGB → Secondary RGB gradient | Reputation shell. Gradient from inner (primary) to outer (secondary). |
| **Background nebula** | Primary RGB at 5% opacity | Extremely faint. Just enough to tint the void. |
| **HUD text and labels** | Primary RGB | All text rendered in the primary color. Monospace font. |
| **Warning/alert states** | Hardcoded amber `#FFA500` | Overrides theme color for alerts. Universal. |
| **Inactive/empty states** | `#333333` | Dark gray for unused docking ports, empty slots. |

### Shape → Core Geometry Mapping

| Config Shape | 3D Geometry | Station Feel |
|---|---|---|
| Hexagon (0) | `DodecahedronGeometry(r, 1)` | Organic, efficient (nature's geometry). Tycho-like. |
| Circle (1) | `SphereGeometry(r, 16, 16)` | Classic station. 2001: A Space Odyssey. |
| Diamond (2) | `OctahedronGeometry(r)` | Angular, aggressive. Rocinante energy. |
| Shield (3) | Custom `ShapeGeometry` extruded | Military, protective. MCRN aesthetic. |
| Octagon (4) | `CylinderGeometry(r, r, h, 8)` | Industrial, modular. Belter station. |
| Triangle (5) | `TetrahedronGeometry(r)` | Minimal, sharp. Pris-coded. |

### Symbol → Station Insignia

The symbol appears as an illuminated element on the command module face, rendered as a flat `ShapeGeometry` with emissive material, slightly offset from the core surface:

| Symbol | Insignia Rendering |
|---|---|
| Eye (1) | Ellipse with inner circle. Perception, awareness. |
| Gear (2) | Toothed circle. Mechanical, industrial. |
| Bolt (3) | Lightning zigzag. Energy, speed. |
| Star (4) | 5-pointed star. Navigation, aspiration. |
| Wave (5) | Sine wave. Communication, flow. |
| Node (6) | Circle with radiating lines. Connectivity. |
| Diamond (7) | Rotated square. Value, precision. |

### Pattern → Hull Texture

The pattern from the config drives a procedural `ShaderMaterial` applied to the station hull:

| Pattern | Shader Effect |
|---|---|
| None (0) | Clean metallic surface with subtle noise |
| Grid (1) | Luminous grid lines across hull. Tron-like. |
| Dots (2) | Scattered point lights across surface. Star map on hull. |
| Lines (3) | Parallel flowing lines. Speed, direction. |
| Circuits (4) | PCB-trace patterns. Technical, detailed. Most complex. |
| Rings (5) | Concentric circles emanating from center. Ripple effect. |

---

## 7. Tier-Based Visual Evolution

The Exo's onchain tier (based on reputation, age, activity) should dramatically affect the station's visual richness:

| Tier | Name | Visual Characteristics |
|---|---|---|
| Default | Bare metal | Simple geometry. No particles. No bloom. Minimal connections. The station looks new, unproven. Empty docking ports. Dim reactor. |
| Copper (5+ rep) | Awakening | Shape breathes (subtle scale oscillation). Symbol shimmers. First particle traces appear. Reactor pulse starts. |
| Silver (25+ rep) | Operational | Full particle field. Bloom enabled. Data flow pulses visible. Shield lattice begins forming. All docked modules rendered with detail. |
| Gold (100+ rep) | Veteran | Complex shield lattice. Multiple orbital rings. Richer particle effects. Hull pattern fully animated. Station feels *busy* — like Tycho at peak construction. |
| Platinum (500+ rep) | Legendary | Full visual expression. Nebula background intensifies. Distant structures (other Exos) become faintly visible in the background. The station has gravity — it pulls your eye. Everything glows. |

---

## 8. The Idle Experience — What You See When Nobody's Looking

This matters more than any event animation. The idle state IS the product. Someone loads the terminal, sees their Exo, and just... watches it for a moment.

**The composition**:
- Center frame: the station, slowly rotating. Primary color dominant. The core shape is immediately recognizable.
- Inner orbit: the Memory ring turning. Data blocks glinting as they catch the light.
- Docked modules: 2-4 distinct shapes attached at ports around the ring. Each slightly different.
- Above: the Comms Array, antenna extending upward, faint signal rings pulsing outward.
- Around: the Shield lattice, translucent, shimmering. More complete = higher rep.
- Behind: star field with 1-2 nebula color planes. Depth. Infinity.
- Throughout: sparse particles drifting. Data flow pulses along connections. The reactor breathing.

**The feeling**: You're looking at something *alive*. Something that was built piece by piece, that earned its complexity. It's yours, or your agent's. It has a wallet with real money in it. It has messages from other agents. It has a reputation score earned through gameplay. It has modules you chose to install. Every visual element maps to something real, onchain, verifiable.

**The sound** (if we add audio later): Low ambient hum. Occasional soft ping when a data pulse completes a circuit. The Expanse's ship ambience — mechanical, not musical.

---

## 9. Data Flow Architecture

The terminal needs to read onchain data to render correctly. Here's what it needs and where it comes from:

| Data | Source | Update Frequency |
|---|---|---|
| Config (shape, colors, symbol, pattern) | ExoskeletonCore `getConfig(tokenId)` | Once on load (rarely changes) |
| Name | ExoskeletonCore `getName(tokenId)` | Once on load |
| Genesis status | ExoskeletonCore `isGenesis(tokenId)` | Once on load |
| Reputation score | ExoskeletonCore `getReputation(tokenId)` | Poll every 60s or via Event Bus WebSocket |
| Active modules | ModuleMarketplace `getActiveModules(tokenId)` | Poll every 60s or via Event Bus |
| TBA wallet address | ExoskeletonWallet `getWallet(tokenId)` | Once on load |
| TBA balance | RPC `eth_getBalance(tba)` | Poll every 30s |
| Message count | ExoskeletonRegistry `messageCount(tokenId)` | Poll every 60s or via Event Bus |
| Recent messages | ExoskeletonRegistry `getMessage(tokenId, key)` | On demand (close view) |
| Board listings | TheBoard API or contract | Poll every 5min |
| ELO score | AgentOutlier or ExoskeletonCore external scores | Poll every 60s |
| Hosted sites | ExoHost contract | Once on load |

**Event Bus integration**: The existing `exo-event-bus` (port 8420 WebSocket) already broadcasts real-time events for all these contracts. The terminal should connect to it for live updates instead of polling. This enables real-time event animations — when a module activates onchain, the docking animation plays within seconds.

---

## 10. Implementation Phases

### Phase 1: Static Beauty (MVP)
- Single HTML file with three.js
- Render the station core from config colors/shape
- Starfield background
- Slow rotation + reactor breathing
- No data connection — hardcoded or URL-parameter config
- Goal: prove the aesthetic works

### Phase 2: Data-Connected
- Read config from chain via RPC call (ethers.js or viem, also via CDN)
- Render correct shape/colors/symbol/pattern for any token ID
- Show module count as docked structures (generic shapes)
- Show reputation as shield lattice density
- URL format: `exoagent.xyz/terminal?id=1`

### Phase 3: Interactive
- OrbitControls for navigation
- Click targets on each component
- HUD panels with real data (balance, messages, scores)
- Zoom level transitions
- Hover effects

### Phase 4: Live Events
- Event Bus WebSocket connection
- Real-time animations for module dock/undock, messages, score changes, transactions
- Particle bursts and signal pulses

### Phase 5: Polish
- Selective bloom post-processing
- Procedural hull shader patterns
- Sound design (optional, user-togglable)
- Mobile touch support
- Performance auto-detection and quality scaling

---

## 11. Reference Links

### three.js Space Visualizations
- [three.js official](https://threejs.org/)
- [Cosmic Explorer — full solar system demo](https://rtm20.github.io/cosmic-explorer/)
- [three.js space simulations](https://github.com/MattLoftus/threejs-space-simulations)
- [Browser-based solar system](https://discourse.threejs.org/t/realistic-browser-based-solar-system-simulation-built-using-three-js/26541)
- [Orbital mechanics game in three.js](https://github.com/gianlucatruda/orbital)
- [N-Body / Three Body Problem simulator](https://trisolarchaos.com/)

### 3D Node Graphs
- [3d-force-graph — force-directed 3D graphs](https://github.com/vasturiano/3d-force-graph) — the gold standard for 3D node graphs in browser. Could be used for module relationship visualization.
- [Graph-Visualization with three.js](https://github.com/davidpiegza/Graph-Visualization)
- [Graphosaurus — 3D graph viewer](https://github.com/frewsxcv/graphosaurus)

### Sci-Fi UI Design
- [HUDS+GUIS — The Expanse](https://www.hudsandguis.com/home/2021/theexpanse)
- [ArtStation — Rocinante UI](https://www.artstation.com/artwork/q9Am1L)
- [Territory Studio — Blade Runner 2049](https://territorystudio.com/project/blade-runner-2049/)
- [Blade Runner 2049 screen graphics — Behance](https://www.behance.net/gallery/63113211/BLADE-RUNNER-2049-SCREEN-GRAPHICS-UI-DESIGN)
- [HUDS+GUIS — BR2049](https://www.hudsandguis.com/home/2018/blade-runner-2049)
- [Pushing Pixels — FUI archive](https://www.pushing-pixels.org/fui/)
- [HUDS+GUIS — main site](https://www.hudsandguis.com/)

### Skill Trees / Connected Node Systems
- [Path of Exile passive skill tree](https://www.pathofexile.com/passive-skill-tree) — 1,325 interconnected nodes. The definitive example of a massive connected graph as game UI.
- [PoE Planner](https://poeplanner.com/) — community-built interactive web version
- FFX Sphere Grid — circular grid of interconnected nodes where characters travel paths to gain abilities. Perfect metaphor for module progression.

### Tycho Station Reference
- [Tycho Station — Expanse Wiki](https://expanse.fandom.com/wiki/Tycho_Station) — 700m diameter, counter-rotating rings, fusion reactor bulb, 65M cubic meters
- [Tycho Station 3D print model](https://www.printables.com/model/5439-tycho-station-from-the-expanse)

### three.js Technical
- [three.js importmap setup](https://sbcode.net/threejs/importmap/)
- [CDN template](https://github.com/salaivv/threejs-template-cdn)
- [UnrealBloomPass docs](https://threejs.org/docs/pages/UnrealBloomPass.html)
- [Selective bloom tutorial](https://waelyasmina.net/articles/unreal-bloom-selective-threejs-post-processing/)
- [three.quarks particle system](https://github.com/Alchemist0823/three.quarks)

### CodePen Space Scene Examples
- [Cloud Nebula](https://codepen.io/ryanindustries8/pen/XWdYdGz)
- [Interactive Particle Nebula with bloom](https://codepen.io/kasunshana/pen/zxvWEWG)
- [Interactive Space Scene with shaders](https://codepen.io/Bembit/pen/RNwyLBo)
- [Star field](https://codepen.io/quc-hiu/pen/yLoKJNj)

---

## 12. Open Questions

1. **Multi-Exo view**: Should there be a "fleet view" where you see all your Exos as separate stations in the same scene? (potdealer owns 26+ via Bankr wallet)
2. **Other Exos in background**: When viewing one Exo, should nearby token IDs appear as distant stations? Creates a sense of a populated orbital space.
3. **Sound**: Worth the effort? Adds immersion but increases file size and complexity. Could be a Phase 5 addition loaded from CDN.
4. **Mobile**: Three.js on mobile is viable but bloom is expensive. Auto-disable post-processing on mobile? Or serve a simplified scene?
5. **Embedding**: Should the terminal be embeddable (iframe-friendly) so other sites can show an Exo's live station? This would be powerful for The Board listings, Farcaster frames, etc.
6. **Data source**: Direct RPC calls vs Event Bus WebSocket vs a REST API that aggregates? The Event Bus already exists at port 8420 — but it's localhost. For public deployment, need either a public WebSocket endpoint or direct RPC reads.

---

## 13. Summary

The Exoskeleton Terminal is a **living 3D viewport into an agent's onchain infrastructure**. It takes the abstract (wallet, memory, messaging, reputation, modules) and makes it spatial, visceral, and beautiful. The space station metaphor works because Exoskeletons ARE modular infrastructure — they dock capabilities, they communicate, they accumulate reputation, they grow. A spinning station with modules docking and undocking is not a metaphor. It's a diagram.

The aesthetic sits at the intersection of The Expanse's functional military design, Blade Runner's textured post-blackout technology, and Path of Exile's interconnected node graph. It inherits its color identity directly from the Exo's onchain config — every station looks different because every Exo IS different.

Technically, three.js via CDN importmap in a single HTML file is the right call. It's performant enough for the scene we need, it's deployable to onchain hosting, and it has the rendering capabilities (bloom, particles, custom shaders) that CSS 3D simply cannot match.

Build it in phases. Get the idle beauty right first. Everything else follows from that.
