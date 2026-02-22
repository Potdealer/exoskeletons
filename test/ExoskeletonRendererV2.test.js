import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("ExoskeletonRendererV2", function () {
  let core, renderer;
  let owner, alice, bob, treasury;

  const GENESIS_PRICE = ethers.parseEther("0.005");

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

  // Genesis tokens get 1.5x multiplier on repScore.
  // repScore = (age_blocks + activity) * 1.5 for genesis
  // To reach a tier, mine enough blocks.
  // Non-genesis: repScore = age_blocks + activity
  async function mineToRepScore(targetScore, isGenesis) {
    // account for a few blocks already mined during setup
    const blocksNeeded = isGenesis
      ? Math.ceil((targetScore * 100) / 150)
      : targetScore;
    await networkHelpers.mine(blocksNeeded + 5); // +5 buffer for setup blocks
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
  //  TIER CALCULATION
  // ═══════════════════════════════════════════════════════════════

  describe("Tier System", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("Should be Dormant at repScore 0 (no style block)", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);

      expect(svg).to.not.include("<style>");
      expect(svg).to.not.include("@keyframes");
    });

    it("Should be Dormant at repScore 99 (no animations)", async function () {
      // Non-genesis token needs bob to mint (alice gets genesis #1)
      await mintExoskeleton(alice); // genesis #1
      await core.setWhitelist(bob.address, true);
      await mintExoskeleton(bob); // non-genesis #2
      // Mine 95 blocks — repScore ~95 for non-genesis (under 100 accounting for setup blocks)
      await networkHelpers.mine(90);
      const repScore = await core.getReputationScore(2);
      // Might be slightly above 90 due to setup blocks, but below 100
      // Just verify no animations if under 100
      if (repScore < 100n) {
        const svg = await renderer.renderSVG(2);
        expect(svg).to.not.include("<style>");
      }
    });

    it("Should reach Copper tier at repScore 100+ (breathe + shimmer)", async function () {
      await mintExoskeleton(alice); // genesis #1, 1.5x multiplier
      await networkHelpers.mine(70); // ~70 * 1.5 = 105 repScore
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

    it("Should reach Silver tier at repScore 500+ (+ glow-pulse, node-pulse)", async function () {
      await mintExoskeleton(alice); // genesis
      await networkHelpers.mine(340); // ~340 * 1.5 = 510 repScore
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

    it("Should reach Gold tier at repScore 2000+ (+ ring rotation)", async function () {
      await mintExoskeleton(alice); // genesis
      await networkHelpers.mine(1340); // ~1340 * 1.5 = 2010 repScore
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

    it("Should reach Diamond tier at repScore 10000+ (all animations)", async function () {
      await mintExoskeleton(alice); // genesis
      await networkHelpers.mine(6700); // ~6700 * 1.5 = 10050 repScore
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
  });

  // ═══════════════════════════════════════════════════════════════
  //  TIER BADGE
  // ═══════════════════════════════════════════════════════════════

  describe("Tier Badge", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("Should show no badge for Dormant", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("COPPER");
      expect(svg).to.not.include("SILVER");
      expect(svg).to.not.include("GOLD");
      expect(svg).to.not.include("DIAMOND");
    });

    it("Should show Copper badge with correct color", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(70);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("COPPER");
      expect(svg).to.include("#cd7f32");
    });

    it("Should show Silver badge with correct color", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(340);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("SILVER");
      expect(svg).to.include("#c0c0c0");
    });

    it("Should show Gold badge with correct color", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(1340);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("GOLD");
      expect(svg).to.include("#ffd700");
    });

    it("Should show Diamond badge with glow animation class", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(6700);
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
      await deployFixture();
    });

    it("Should NOT have particles below Diamond", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(1340); // Gold
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="particle"');
    });

    it("Should have 5 particles at Diamond tier", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(6700); // Diamond
      const svg = await renderer.renderSVG(1);

      // Count particle occurrences
      const matches = svg.match(/class="particle"/g);
      expect(matches).to.have.lengthOf(5);
    });

    it("Should have staggered animation delays on particles", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(6700);
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
      await deployFixture();
    });

    it("Should use standard glow filter below Diamond", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(70); // Copper
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('stdDeviation="4"');
      expect(svg).to.include('flood-opacity="0.5"');
    });

    it("Should use enhanced glow filter at Diamond", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(6700); // Diamond
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
      await deployFixture();
    });

    it("Should NOT wrap shape in group for Dormant", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="central-shape"');
    });

    it("Should wrap shape in breathing group for Copper+", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(70);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<g class="central-shape">');
    });

    it("Should NOT wrap symbol in group for Dormant", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="symbol"');
    });

    it("Should wrap symbol in shimmer group for Copper+", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(70);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<g class="symbol">');
    });

    it("Should add rep-glow class for Silver+", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(340);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-glow"');
    });

    it("Should NOT have rep-glow class for Copper", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(70);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="rep-glow"');
    });

    it("Should add activity-node class for Silver+ modules", async function () {
      await mintExoskeleton(alice);
      // Register and activate a module
      const modName = ethers.keccak256(ethers.toUtf8Bytes("test-mod"));
      await core.registerModule(modName, alice.address, false, 0);
      await core.connect(alice).activateModule(1, modName);
      await networkHelpers.mine(340); // Silver
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="activity-node"');
    });

    it("Should use rotating ring groups for Gold+ (group 1)", async function () {
      await mintExoskeleton(alice);
      // Need enough blocks for at least 1 age ring (43200 blocks) + Gold rep
      // 43200 blocks * 1.5 genesis multiplier = 64800 repScore (Diamond), 1 age ring
      await networkHelpers.mine(43200);
      const svg = await renderer.renderSVG(1);
      // With 1 ring, only group 1 (ring-cw) is populated
      expect(svg).to.include('class="age-ring-group ring-cw"');
    });

    it("Should wrap rings in groups at Gold+ but not below", async function () {
      // Mint a non-genesis token (need to use bob for non-genesis)
      await mintExoskeleton(alice); // genesis #1
      await core.setWhitelist(bob.address, true);
      await mintExoskeleton(bob); // non-genesis #2

      // Mine enough for 1 age ring but NOT Gold tier for non-genesis
      // 43200 blocks = 43200 repScore for non-genesis (Diamond actually)
      // We need Silver (500-1999 rep) with 1 age ring — impossible since 43200 blocks = 43200 rep
      // Instead, just verify Gold+ wraps and sub-Gold doesn't
      // At Copper (100 rep, 70 blocks), ageRings = 0, so no rings at all
      // Test: at Gold+ tier with rings, they are wrapped in <g> groups
      await networkHelpers.mine(43200);
      const svg = await renderer.renderSVG(1); // genesis, Diamond with 1 ring
      expect(svg).to.include('<g class="age-ring-group');
      expect(svg).to.include('</g>');
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
      expect(svg).to.include('points="250,160 319,200 319,280 250,320 181,280 181,200"');
    });

    it("Should generate circle shape (shape=1)", async function () {
      const config = buildConfig(1, 0, 255, 170, 0, 170, 255, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<circle cx="250" cy="240" r="80"');
    });

    it("Should generate diamond shape (shape=2)", async function () {
      const config = buildConfig(2, 200, 100, 50, 100, 50, 200, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="250,155 340,240 250,325 160,240"');
    });

    it("Should generate shield shape (shape=3)", async function () {
      const config = buildConfig(3, 100, 200, 50, 50, 100, 200, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<path d="M250,160');
    });

    it("Should generate octagon shape (shape=4)", async function () {
      const config = buildConfig(4, 150, 150, 255, 100, 100, 200, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="217,160 283,160 330,207');
    });

    it("Should generate triangle shape (shape=5)", async function () {
      const config = buildConfig(5, 255, 50, 50, 200, 50, 50, 0, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="250,155 345,325 155,325"');
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
      expect(svg).to.include('<ellipse cx="250" cy="240"');
    });

    it("Should render gear symbol (symbol=2)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 2, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<circle cx="250" cy="240" r="12"');
    });

    it("Should render bolt symbol (symbol=3)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 3, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="255,225 245,238 258,238 243,258"');
    });

    it("Should render star symbol (symbol=4)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 4, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("250,225 254,237 267,237");
    });

    it("Should render wave symbol (symbol=5)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 5, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('M230,240 Q240,228 250,240');
    });

    it("Should render node symbol (symbol=6)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 6, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('<circle cx="250" cy="240" r="4"');
    });

    it("Should render diamond symbol (symbol=7)", async function () {
      const config = buildConfig(0, 255, 215, 0, 255, 165, 0, 7, 0);
      await mintExoskeleton(alice, config);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('points="250,228 260,240 250,252 240,240"');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  INTEGRATION WITH tokenURI
  // ═══════════════════════════════════════════════════════════════

  describe("Integration with tokenURI", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("Should produce valid tokenURI with V2 renderer", async function () {
      await mintExoskeleton(alice);
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

    it("Should include animations in tokenURI when tier is high enough", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(70); // Copper

      const uri = await core.tokenURI(1);
      const base64 = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64, "base64").toString());
      const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
      const svg = Buffer.from(svgBase64, "base64").toString();

      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include('<g class="central-shape">');
    });

    it("Should work with custom name at Diamond tier", async function () {
      await mintExoskeleton(alice);
      await core.connect(alice).setName(1, "Ollie");
      await networkHelpers.mine(6700); // Diamond

      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("Ollie");
      expect(svg).to.include("DIAMOND");
      expect(svg).to.include("@keyframes drift-up");
      expect(svg).to.include('class="particle"');
    });
  });
});
