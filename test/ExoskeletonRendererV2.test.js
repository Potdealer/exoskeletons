import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("ExoskeletonRendererV2", function () {
  let core, renderer;
  let owner, alice, bob, treasury;

  async function deployFixture() {
    [owner, alice, bob, treasury] = await ethers.getSigners();

    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
    renderer = await ethers.deployContract("ExoskeletonRendererV2", [
      await core.getAddress(),
    ]);

    // Set V2 renderer on core
    await core.setRenderer(await renderer.getAddress());

    // Whitelist alice for minting
    await core.setWhitelist(alice.address, true);
  }

  async function mintExoskeleton(signer, config) {
    config = config || ethers.toUtf8Bytes("default-config");
    const isWL = await core.whitelist(signer.address);
    const usedFree = await core.usedFreeMint(signer.address);
    const value = isWL && !usedFree ? 0n : await core.getMintPrice();
    await core.connect(signer).mint(config, { value });
    return await core.nextTokenId() - 1n;
  }

  // Build a 9-byte config: [shape, R1, G1, B1, R2, G2, B2, symbol, pattern]
  function buildConfig(shape, r1, g1, b1, r2, g2, b2, symbol, pattern) {
    return new Uint8Array([shape, r1, g1, b1, r2, g2, b2, symbol, pattern]);
  }

  // ─── Activity Helpers ───────────────────────────────────────────
  // Activity = messages + writes*2 + modules*10, genesis gets 1.5x

  // Send N messages from a token (requires 2 tokens for messaging)
  async function sendMessages(signer, fromToken, toToken, count) {
    const channel = ethers.keccak256(ethers.toUtf8Bytes("test"));
    for (let i = 0; i < count; i++) {
      await core.connect(signer).sendMessage(fromToken, toToken, channel, 0, ethers.toUtf8Bytes("msg"));
    }
  }

  // Write N storage entries on a token
  async function writeStorage(signer, tokenId, count) {
    for (let i = 0; i < count; i++) {
      const key = ethers.keccak256(ethers.toUtf8Bytes("key-" + i));
      await core.connect(signer).setData(tokenId, key, ethers.toUtf8Bytes("val"));
    }
  }

  // Register and activate N modules on a token
  async function activateModules(signer, tokenId, count) {
    for (let i = 0; i < count; i++) {
      const modName = ethers.keccak256(ethers.toUtf8Bytes("mod-" + tokenId + "-" + i));
      await core.registerModule(modName, signer.address, false, 0);
      await core.connect(signer).activateModule(tokenId, modName);
    }
  }

  // Mint 2 genesis tokens for alice so we can send messages between them
  async function setupWithMessaging() {
    await deployFixture();
    await mintExoskeleton(alice); // genesis #1
    await mintExoskeleton(alice); // genesis #2
  }

  // Reach Diamond efficiently: 8 modules (80) + 254 writes (508) + 80 msgs = 668 raw * 1.5 = 1002
  // Max 8 modules per genesis token, so we supplement with writes (2x) and msgs
  async function reachDiamond(signer, tokenId, otherTokenId) {
    // 8 modules = 80 raw
    await activateModules(signer, tokenId, 8);
    // 254 writes = 508 raw
    await writeStorage(signer, tokenId, 254);
    // 80 msgs = 80 raw. Total: 80 + 508 + 80 = 668. * 1.5 = 1002
    await sendMessages(signer, tokenId, otherTokenId, 80);
  }

  describe("Deployment", function () {
    it("Should deploy with correct core address", async function () {
      await deployFixture();
      expect(await renderer.coreContract()).to.equal(await core.getAddress());
    });

    it("Should allow owner to update core address", async function () {
      await deployFixture();
      await renderer.setCoreContract(alice.address);
      expect(await renderer.coreContract()).to.equal(alice.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  TIER CALCULATION (activity-based)
  // ═══════════════════════════════════════════════════════════════

  describe("Tier System", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should be Dormant with 0 activity (no style block)", async function () {
      const svg = await renderer.renderSVG(1);

      expect(svg).to.not.include("<style>");
      expect(svg).to.not.include("@keyframes");
    });

    it("Should be Dormant with activity below 5 (genesis: raw < 4)", async function () {
      // Genesis 1.5x: 2 msgs = 2 * 1.5 = 3 activity. Under 5 = Dormant
      await sendMessages(alice, 1, 2, 2);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("<style>");
    });

    it("Should reach Copper at activity 5+ (breathe + shimmer)", async function () {
      // Genesis 1.5x: 4 msgs = 4 * 1.5 = 6 activity. >= 5 = Copper
      await sendMessages(alice, 1, 2, 4);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.include("<style>");
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes shimmer");
      expect(svg).to.include('class="central-shape"');
      expect(svg).to.include('class="symbol"');
      // Should NOT have Silver+ animations
      expect(svg).to.not.include("@keyframes glow-pulse");
      expect(svg).to.not.include("@keyframes ring-rotate");
      expect(svg).to.not.include("@keyframes drift-up");
    });

    it("Should reach Silver at activity 50+ (+ glow-pulse, node-pulse)", async function () {
      // Genesis 1.5x: 34 msgs = 34 * 1.5 = 51 activity. >= 50 = Silver
      await sendMessages(alice, 1, 2, 34);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes shimmer");
      expect(svg).to.include("@keyframes glow-pulse");
      expect(svg).to.include("@keyframes node-pulse");
      expect(svg).to.include('class="rep-glow"');
      // Should NOT have Gold+ animations
      expect(svg).to.not.include("@keyframes ring-rotate");
      expect(svg).to.not.include("@keyframes drift-up");
    });

    it("Should reach Gold at activity 200+ (+ ring rotation)", async function () {
      // Genesis 1.5x: 5 modules = 50 * 1.5 = 75, + 84 msgs = 84*1.5 = 126. Total ~201
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes glow-pulse");
      expect(svg).to.include("@keyframes ring-rotate");
      expect(svg).to.include("@keyframes ring-rotate-rev");
      expect(svg).to.include("ring-cw");
      expect(svg).to.include("ring-ccw");
      expect(svg).to.include("ring-cw-slow");
      // Should NOT have Diamond animations
      expect(svg).to.not.include("@keyframes drift-up");
      expect(svg).to.not.include("@keyframes badge-glow");
    });

    it("Should reach Diamond at activity 1000+ (all animations)", async function () {
      this.timeout(120000);
      // Genesis 1.5x: 67 modules = 670 * 1.5 = 1005 activity
      await reachDiamond(alice, 1, 2);
      const svg = await renderer.renderSVG(1);

      // All animation keyframes present
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes shimmer");
      expect(svg).to.include("@keyframes glow-pulse");
      expect(svg).to.include("@keyframes node-pulse");
      expect(svg).to.include("@keyframes ring-rotate");
      expect(svg).to.include("@keyframes ring-rotate-rev");
      expect(svg).to.include("@keyframes drift-up");
      expect(svg).to.include("@keyframes badge-glow");
      expect(svg).to.include('class="tier-badge"');
      expect(svg).to.include('class="particle"');
    });

    it("Genesis 1.5x multiplier: 3 raw msgs (4.5) = Dormant, 4 raw msgs (6) = Copper", async function () {
      // Genesis 1.5x: 3 msgs * 1.5 = 4.5, floored to 4 (integer math: 3*3/2=4). Under 5 = Dormant
      await sendMessages(alice, 1, 2, 3);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("<style>");

      // 1 more msg: total 4 msgs * 1.5 = 6. >= 5 = Copper
      await sendMessages(alice, 1, 2, 1);
      const svg2 = await renderer.renderSVG(1);
      expect(svg2).to.include("@keyframes breathe");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  TIER BADGE
  // ═══════════════════════════════════════════════════════════════

  describe("Tier Badge", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should show no badge for Dormant", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("COPPER");
      expect(svg).to.not.include("SILVER");
      expect(svg).to.not.include("GOLD");
      expect(svg).to.not.include("DIAMOND");
    });

    it("Should show Copper badge with correct color", async function () {
      await sendMessages(alice, 1, 2, 4); // 4*1.5=6 activity
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("COPPER");
      expect(svg).to.include("#cd7f32");
    });

    it("Should show Silver badge with correct color", async function () {
      await sendMessages(alice, 1, 2, 34); // 34*1.5=51 activity
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("SILVER");
      expect(svg).to.include("#c0c0c0");
    });

    it("Should show Gold badge with correct color", async function () {
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84); // (50+84)*1.5=201
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("GOLD");
      expect(svg).to.include("#ffd700");
    });

    it("Should show Diamond badge with glow animation class", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("DIAMOND");
      expect(svg).to.include("#b9f2ff");
      expect(svg).to.include('class="tier-badge"');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  PARTICLES (Diamond only)
  // ═══════════════════════════════════════════════════════════════

  describe("Particles", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should NOT have particles below Diamond", async function () {
      // Gold tier
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="particle"');
    });

    it("Should have 5 particles at Diamond tier", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      const svg = await renderer.renderSVG(1);

      const matches = svg.match(/class="particle"/g);
      expect(matches).to.have.lengthOf(5);
    });

    it("Should have staggered animation delays on particles", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.include("animation-delay:1.5s");
      expect(svg).to.include("animation-delay:3s");
      expect(svg).to.include("animation-delay:4.5s");
      expect(svg).to.include("animation-delay:6s");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ENHANCED GLOW FILTER (Diamond)
  // ═══════════════════════════════════════════════════════════════

  describe("Enhanced Glow Filter", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should use standard glow filter below Diamond", async function () {
      await sendMessages(alice, 1, 2, 4); // Copper
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('stdDeviation="4"');
      expect(svg).to.include('flood-opacity="0.5"');
    });

    it("Should use enhanced glow filter at Diamond", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('stdDeviation="6"');
      expect(svg).to.include('flood-opacity="0.7"');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ANIMATION CLASSES ON ELEMENTS
  // ═══════════════════════════════════════════════════════════════

  describe("Animation Classes", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should NOT wrap shape in group for Dormant", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="central-shape"');
    });

    it("Should wrap shape in breathing group for Copper+", async function () {
      await sendMessages(alice, 1, 2, 4);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<g class="central-shape">');
    });

    it("Should NOT wrap symbol in group for Dormant", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="symbol"');
    });

    it("Should wrap symbol in shimmer group for Copper+", async function () {
      await sendMessages(alice, 1, 2, 4);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<g class="symbol">');
    });

    it("Should add rep-glow class for Silver+", async function () {
      await sendMessages(alice, 1, 2, 34);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-glow"');
    });

    it("Should NOT have rep-glow class for Copper", async function () {
      await sendMessages(alice, 1, 2, 4);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="rep-glow"');
    });

    it("Should add activity-node class for Silver+ with modules", async function () {
      // 1 module = 10, + 27 msgs = 27. Total raw 37 * 1.5 = 55.5 => Silver
      await activateModules(alice, 1, 1);
      await sendMessages(alice, 1, 2, 27);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="activity-node"');
    });

    it("Should use rotating ring groups for Gold+ with age rings", async function () {
      // Need Gold activity + age rings (43200 blocks for 1 ring)
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84);
      await networkHelpers.mine(43200); // 1 age ring
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="age-ring-group ring-cw"');
    });

    it("Should NOT wrap rings in groups below Gold even with age rings", async function () {
      // Copper activity + age rings
      await sendMessages(alice, 1, 2, 4); // Copper
      await networkHelpers.mine(43200); // 1 age ring
      const svg = await renderer.renderSVG(1);
      // Should have static ring (cy="250") but NOT wrapped in group
      expect(svg).to.include('cy="250"');
      expect(svg).to.not.include('class="age-ring-group');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  COMPLEXITY (tier-derived)
  // ═══════════════════════════════════════════════════════════════

  describe("Complexity", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Dormant should have no pattern or glow (complexity=0)", async function () {
      const config = buildConfig(0, 255, 0, 100, 100, 0, 255, 1, 5); // rings pattern
      await core.connect(alice).setVisualConfig(1, config);
      const svg = await renderer.renderSVG(1);
      // Pattern=5 (rings) but complexity=0 → no pattern rendered
      // Check that inner concentric rings don't appear
      expect(svg).to.not.include('stroke-width="0.4" opacity="0.12"');
    });

    it("Copper should have complexity=2", async function () {
      const config = buildConfig(0, 255, 0, 100, 100, 0, 255, 1, 5); // rings pattern
      await core.connect(alice).setVisualConfig(1, config);
      await sendMessages(alice, 1, 2, 4); // Copper
      const svg = await renderer.renderSVG(1);
      // Complexity=2 with rings pattern: 2 inner rings
      // r = 20 + 1*12 = 32, r = 20 + 2*12 = 44
      expect(svg).to.include('r="32"');
      expect(svg).to.include('r="44"');
      expect(svg).to.not.include('r="56"'); // would need complexity >= 3
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BACKWARDS COMPATIBILITY (Dormant = V1)
  // ═══════════════════════════════════════════════════════════════

  describe("Backwards Compatibility (Dormant tier)", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("Should generate valid SVG at Dormant tier", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.include('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).to.include("</svg>");
      expect(svg).to.include("EXOSKELETON");
      expect(svg).to.include("#1");
    });

    it("Should include genesis elements for genesis tokens", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.include("GENESIS");
      expect(svg).to.include("#FFD700");
    });

    it("Should show stats bar at Dormant", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.include("MSG:0");
      expect(svg).to.include("STO:0");
      expect(svg).to.include("MOD:0");
    });

    it("Should have NO style block at Dormant (identical to V1 output)", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.not.include("<style>");
      expect(svg).to.not.include("</style>");
      expect(svg).to.not.include("@keyframes");
      expect(svg).to.not.include('class="central-shape"');
      expect(svg).to.not.include('class="symbol"');
      expect(svg).to.not.include('class="rep-glow"');
      expect(svg).to.not.include('class="particle"');
      expect(svg).to.not.include('class="tier-badge"');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AGE RINGS (separate from tier)
  // ═══════════════════════════════════════════════════════════════

  describe("Age Rings", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("Should have 0 rings on a fresh mint", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('stroke-dasharray');
    });

    it("Should have 1 ring after 43200 blocks", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(43200);
      const svg = await renderer.renderSVG(1);
      // 1 ring: static (Dormant tier), dashed stroke
      expect(svg).to.include('stroke-dasharray="3 5"');
    });

    it("Should cap at 8 rings", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(43200 * 10); // 10 days worth, but cap is 8
      const svg = await renderer.renderSVG(1);
      // Ring 8: dasharray = "24 40"
      expect(svg).to.include('stroke-dasharray="24 40"');
      // Ring 9 would be "27 45" — should NOT exist
      expect(svg).to.not.include('stroke-dasharray="27 45"');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ALL SHAPES STILL RENDER
  // ═══════════════════════════════════════════════════════════════

  describe("Shape Rendering", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("Should generate hexagon shape (shape=0)", async function () {
      const config = buildConfig(0, 255, 0, 100, 100, 0, 255, 1, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="250,170 319,210 319,290 250,330 181,290 181,210"');
    });

    it("Should generate circle shape (shape=1)", async function () {
      const config = buildConfig(1, 0, 255, 170, 0, 170, 255, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<circle cx="250" cy="250" r="80"');
    });

    it("Should generate diamond shape (shape=2)", async function () {
      const config = buildConfig(2, 200, 100, 50, 100, 50, 200, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="250,165 340,250 250,335 160,250"');
    });

    it("Should generate shield shape (shape=3)", async function () {
      const config = buildConfig(3, 100, 200, 50, 50, 100, 200, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<path d="M250,170');
    });

    it("Should generate octagon shape (shape=4)", async function () {
      const config = buildConfig(4, 150, 150, 255, 100, 100, 200, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="217,170 283,170 330,217');
    });

    it("Should generate triangle shape (shape=5)", async function () {
      const config = buildConfig(5, 255, 50, 50, 200, 50, 50, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="250,165 345,335 155,335"');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ALL SYMBOLS STILL RENDER
  // ═══════════════════════════════════════════════════════════════

  describe("Symbol Rendering", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("Should render eye symbol (symbol=1)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 1, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<ellipse cx="250" cy="250"');
    });

    it("Should render gear symbol (symbol=2)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 2, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<circle cx="250" cy="250" r="12"');
    });

    it("Should render bolt symbol (symbol=3)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 3, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="255,235 245,248 258,248 243,268"');
    });

    it("Should render star symbol (symbol=4)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 4, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("250,235 254,247 267,247");
    });

    it("Should render wave symbol (symbol=5)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 5, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('M230,250 Q240,238 250,250');
    });

    it("Should render node symbol (symbol=6)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 6, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<circle cx="250" cy="250" r="4"');
    });

    it("Should render diamond symbol (symbol=7)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 7, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="250,238 260,250 250,262 240,250"');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  INTEGRATION WITH tokenURI
  // ═══════════════════════════════════════════════════════════════

  describe("Integration with tokenURI", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should produce valid tokenURI with V2 renderer", async function () {
      const uri = await core.tokenURI(1);

      expect(uri).to.match(/^data:application\/json;base64,/);

      const base64 = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64, "base64").toString());

      expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);

      const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
      const svg = Buffer.from(svgBase64, "base64").toString();

      expect(svg).to.include('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).to.include("EXOSKELETON");
      expect(svg).to.include("GENESIS");
    });

    it("Should include animations in tokenURI at Copper+", async function () {
      await sendMessages(alice, 1, 2, 4); // Copper

      const uri = await core.tokenURI(1);
      const base64 = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64, "base64").toString());
      const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
      const svg = Buffer.from(svgBase64, "base64").toString();

      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include('<g class="central-shape">');
    });

    it("Should work with custom name at Diamond tier", async function () {
      this.timeout(120000);
      await core.connect(alice).setName(1, "Ollie");
      await reachDiamond(alice, 1, 2);

      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("Ollie");
      expect(svg).to.include("DIAMOND");
      expect(svg).to.include("@keyframes drift-up");
      expect(svg).to.include('class="particle"');
    });
  });
});
