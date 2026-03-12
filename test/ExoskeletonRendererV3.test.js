import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("ExoskeletonRendererV3", function () {
  let core, renderer;
  let owner, alice, bob, treasury;

  // keccak256("composite-reputation")
  const REPUTATION_KEY = "0xd98f4cc3b1a6636684588d76c091b8f9d3af09d0d60485010a123ba559716a25";

  async function deployFixture() {
    [owner, alice, bob, treasury] = await ethers.getSigners();

    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
    renderer = await ethers.deployContract("ExoskeletonRendererV3", [
      await core.getAddress(),
    ]);

    await core.setRenderer(await renderer.getAddress());
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

  function buildConfig(shape, r1, g1, b1, r2, g2, b2, symbol, pattern) {
    return new Uint8Array([shape, r1, g1, b1, r2, g2, b2, symbol, pattern]);
  }

  async function sendMessages(signer, fromToken, toToken, count) {
    const channel = ethers.keccak256(ethers.toUtf8Bytes("test"));
    for (let i = 0; i < count; i++) {
      await core.connect(signer).sendMessage(fromToken, toToken, channel, 0, ethers.toUtf8Bytes("msg"));
    }
  }

  async function writeStorage(signer, tokenId, count) {
    for (let i = 0; i < count; i++) {
      const key = ethers.keccak256(ethers.toUtf8Bytes("key-" + i));
      await core.connect(signer).setData(tokenId, key, ethers.toUtf8Bytes("val"));
    }
  }

  async function activateModules(signer, tokenId, count) {
    for (let i = 0; i < count; i++) {
      const modName = ethers.keccak256(ethers.toUtf8Bytes("mod-" + tokenId + "-" + i));
      await core.registerModule(modName, signer.address, false, 0);
      await core.connect(signer).activateModule(tokenId, modName);
    }
  }

  async function setupWithMessaging() {
    await deployFixture();
    await mintExoskeleton(alice); // genesis #1
    await mintExoskeleton(alice); // genesis #2
  }

  async function reachDiamond(signer, tokenId, otherTokenId) {
    await activateModules(signer, tokenId, 8);
    await writeStorage(signer, tokenId, 254);
    await sendMessages(signer, tokenId, otherTokenId, 80);
  }

  // Grant scorer and set reputation score on a token
  async function setReputation(signer, tokenId, score) {
    await core.connect(signer).grantScorer(tokenId, signer.address);
    await core.connect(signer).setExternalScore(tokenId, REPUTATION_KEY, score);
  }

  // ═══════════════════════════════════════════════════════════════
  //  V2 BACKWARDS COMPATIBILITY — All V2 tests should still pass
  // ═══════════════════════════════════════════════════════════════

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

    it("Should have correct REPUTATION_KEY constant", async function () {
      await deployFixture();
      expect(await renderer.REPUTATION_KEY()).to.equal(REPUTATION_KEY);
    });
  });

  describe("Tier System (V2 compat)", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should be Dormant with 0 activity (no style block)", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("<style>");
      expect(svg).to.not.include("@keyframes");
    });

    it("Should be Dormant with activity below 5 (genesis: raw < 4)", async function () {
      await sendMessages(alice, 1, 2, 2);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("<style>");
    });

    it("Should reach Copper at activity 5+ (breathe + shimmer)", async function () {
      await sendMessages(alice, 1, 2, 4);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("<style>");
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes shimmer");
      expect(svg).to.include('class="central-shape"');
      expect(svg).to.include('class="symbol"');
      expect(svg).to.not.include("@keyframes glow-pulse");
      expect(svg).to.not.include("@keyframes ring-cw");
      expect(svg).to.not.include("@keyframes drift-up");
    });

    it("Should reach Silver at activity 50+ (+ glow-pulse, node-pulse)", async function () {
      await sendMessages(alice, 1, 2, 34);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes shimmer");
      expect(svg).to.include("@keyframes glow-pulse");
      expect(svg).to.include("@keyframes node-pulse");
      expect(svg).to.include('class="rep-glow"');
      expect(svg).to.not.include("@keyframes ring-cw");
      expect(svg).to.not.include("@keyframes drift-up");
    });

    it("Should reach Gold at activity 200+ (+ ring rotation)", async function () {
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes glow-pulse");
      expect(svg).to.include("@keyframes ring-cw");
      expect(svg).to.include("@keyframes ring-ccw");
      expect(svg).to.include(".age-ring{");
      expect(svg).to.include(".r1{");
      expect(svg).to.not.include("@keyframes drift-up");
      expect(svg).to.not.include("@keyframes badge-glow");
    });

    it("Should reach Diamond at activity 1000+ (all animations)", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes shimmer");
      expect(svg).to.include("@keyframes glow-pulse");
      expect(svg).to.include("@keyframes node-pulse");
      expect(svg).to.include("@keyframes ring-cw");
      expect(svg).to.include("@keyframes ring-ccw");
      expect(svg).to.include("@keyframes drift-up");
      expect(svg).to.include("@keyframes badge-glow");
      expect(svg).to.include('class="tier-badge"');
      expect(svg).to.include('class="particle"');
    });

    it("Genesis 1.5x multiplier: 3 raw msgs (4.5) = Dormant, 4 raw msgs (6) = Copper", async function () {
      await sendMessages(alice, 1, 2, 3);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("<style>");

      await sendMessages(alice, 1, 2, 1);
      const svg2 = await renderer.renderSVG(1);
      expect(svg2).to.include("@keyframes breathe");
    });
  });

  describe("Tier Badge (V2 compat)", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should show no badge for Dormant", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("COPPER");
      expect(svg).to.not.include("SILVER");
      expect(svg).to.not.include("GOLD");
      expect(svg).to.not.include("DIAMOND");
      expect(svg).to.not.include("ASCENDANT");
    });

    it("Should show Copper badge with correct color", async function () {
      await sendMessages(alice, 1, 2, 4);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("COPPER");
      expect(svg).to.include("#cd7f32");
    });

    it("Should show Silver badge with correct color", async function () {
      await sendMessages(alice, 1, 2, 34);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("SILVER");
      expect(svg).to.include("#c0c0c0");
    });

    it("Should show Gold badge with correct color", async function () {
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84);
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

  describe("Particles (V2 compat)", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should NOT have particles below Diamond", async function () {
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

  describe("Enhanced Glow Filter (V2 compat)", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should use standard glow filter below Diamond", async function () {
      await sendMessages(alice, 1, 2, 4);
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

  describe("Animation Classes (V2 compat)", function () {
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
      await activateModules(alice, 1, 1);
      await sendMessages(alice, 1, 2, 27);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="activity-node"');
    });

    it("Should use rotating ring wrappers for Gold+ with age rings", async function () {
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84);
      await networkHelpers.mine(43200);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="age-ring r1"');
    });

    it("Should NOT wrap rings in rotating groups below Gold even with age rings", async function () {
      await sendMessages(alice, 1, 2, 4);
      await networkHelpers.mine(43200);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('cy="250"');
      expect(svg).to.not.include('class="age-ring');
    });
  });

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

    it("Should show stats bar at Dormant with REP:0", async function () {
      await mintExoskeleton(alice);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("MSG:0");
      expect(svg).to.include("STO:0");
      expect(svg).to.include("MOD:0");
      expect(svg).to.include("REP:0");
    });

    it("Should have NO style block at Dormant with no reputation", async function () {
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
      expect(svg).to.not.include('class="rep-particle-group"');
    });
  });

  describe("Age Rings (V2 compat)", function () {
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
      expect(svg).to.include('stroke-dasharray="3 5"');
    });

    it("Should cap at 6 rings", async function () {
      await mintExoskeleton(alice);
      await networkHelpers.mine(43200 * 10);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('stroke-dasharray="18 30"');
      expect(svg).to.not.include('stroke-dasharray="21 35"');
    });
  });

  describe("Shape Rendering (V2 compat)", function () {
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

  describe("Symbol Rendering (V2 compat)", function () {
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

  describe("Integration with tokenURI (V2 compat)", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should produce valid tokenURI with V3 renderer", async function () {
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
      await sendMessages(alice, 1, 2, 4);
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

  // ═══════════════════════════════════════════════════════════════
  //  V3 NEW FEATURES — Reputation-based visual evolution
  // ═══════════════════════════════════════════════════════════════

  describe("Reputation Aura", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should have no aura when reputation is 0", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="rep-aura"');
    });

    it("Should have faint aura at rep 1-500 (r=90, opacity 0.05)", async function () {
      await setReputation(alice, 1, 100);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-aura"');
      expect(svg).to.include('r="90"');
      expect(svg).to.include('opacity="0.05"');
    });

    it("Should have visible aura at rep 501-1500 (r=105, opacity 0.15)", async function () {
      await setReputation(alice, 1, 1000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-aura"');
      expect(svg).to.include('r="105"');
      expect(svg).to.include('opacity="0.15"');
    });

    it("Should have strong aura at rep 1501-3000 (r=120, opacity 0.25)", async function () {
      await setReputation(alice, 1, 2000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-aura"');
      expect(svg).to.include('r="120"');
      expect(svg).to.include('opacity="0.25"');
    });

    it("Should have intense aura at rep 3000+ (r=140, opacity 0.35)", async function () {
      await setReputation(alice, 1, 5000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-aura"');
      expect(svg).to.include('r="140"');
      expect(svg).to.include('opacity="0.35"');
    });

    it("Should use blended color for aura", async function () {
      // Config: primary (200, 100, 50), secondary (100, 50, 200) → blend (150, 75, 125)
      const config = buildConfig(0, 200, 100, 50, 100, 50, 200, 1, 0);
      await core.connect(alice).setVisualConfig(1, config);
      await setReputation(alice, 1, 100);
      const svg = await renderer.renderSVG(1);
      // Blended: (200+100)/2=150, (100+50)/2=75, (50+200)/2=125
      expect(svg).to.include('class="rep-aura"');
      // #964b7d = hex(150, 75, 125)
      expect(svg).to.include('#964b7d');
    });
  });

  describe("Reputation Particles", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should have no reputation particles when rep is 0", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="rep-particle-group"');
    });

    it("Should have 3 particles at rep 1-500 with 30s orbit", async function () {
      await setReputation(alice, 1, 250);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-particle-group"');
      expect(svg).to.include("rep-orbit 30s");
      // Count circles inside rep-particle-group
      const groupMatch = svg.match(/<g class="rep-particle-group">(.*?)<\/g>/s);
      expect(groupMatch).to.not.be.null;
      const circles = groupMatch[1].match(/<circle /g);
      expect(circles).to.have.lengthOf(3);
    });

    it("Should have 6 particles at rep 501-1500 with 20s orbit", async function () {
      await setReputation(alice, 1, 1000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-particle-group"');
      expect(svg).to.include("rep-orbit 20s");
      const groupMatch = svg.match(/<g class="rep-particle-group">(.*?)<\/g>/s);
      const circles = groupMatch[1].match(/<circle /g);
      expect(circles).to.have.lengthOf(6);
    });

    it("Should have 10 particles at rep 1501-3000 with 15s orbit", async function () {
      await setReputation(alice, 1, 2000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-particle-group"');
      expect(svg).to.include("rep-orbit 15s");
      const groupMatch = svg.match(/<g class="rep-particle-group">(.*?)<\/g>/s);
      const circles = groupMatch[1].match(/<circle /g);
      expect(circles).to.have.lengthOf(10);
    });

    it("Should have 15 particles at rep 3000+ with 10s orbit", async function () {
      await setReputation(alice, 1, 4000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="rep-particle-group"');
      expect(svg).to.include("rep-orbit 10s");
      const groupMatch = svg.match(/<g class="rep-particle-group">(.*?)<\/g>/s);
      const circles = groupMatch[1].match(/<circle /g);
      expect(circles).to.have.lengthOf(15);
    });

    it("Should use secondary color for reputation particles", async function () {
      const config = buildConfig(0, 255, 0, 0, 0, 255, 0, 1, 0);
      await core.connect(alice).setVisualConfig(1, config);
      await setReputation(alice, 1, 100);
      const svg = await renderer.renderSVG(1);
      const groupMatch = svg.match(/<g class="rep-particle-group">(.*?)<\/g>/s);
      // Secondary hex = #00ff00
      expect(groupMatch[1]).to.include('#00ff00');
    });
  });

  describe("Reputation Stats Display", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should show REP:0 when no reputation set", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("REP:0");
    });

    it("Should show positive reputation score", async function () {
      await setReputation(alice, 1, 1500);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("REP:1500");
    });

    it("Should show negative reputation score", async function () {
      await setReputation(alice, 1, -200);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("REP:-200");
    });
  });

  describe("Reputation CSS Animations", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should NOT include rep-orbit animation when rep is 0", async function () {
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include("@keyframes rep-orbit");
    });

    it("Should include rep-orbit animation when rep > 0", async function () {
      await setReputation(alice, 1, 100);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("@keyframes rep-orbit");
      expect(svg).to.include(".rep-particle-group{");
    });

    it("Dormant tier with reputation still gets style block for rep animations", async function () {
      // No activity (Dormant) but has reputation
      await setReputation(alice, 1, 500);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("<style>");
      expect(svg).to.include("@keyframes rep-orbit");
      // Should NOT have tier animations
      expect(svg).to.not.include("@keyframes breathe");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ASCENDANT TIER
  // ═══════════════════════════════════════════════════════════════

  describe("Ascendant Tier", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should NOT be Ascendant at Diamond without sufficient reputation", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 3000); // below 5000 threshold
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("DIAMOND");
      expect(svg).to.not.include("ASCENDANT");
      expect(svg).to.not.include("ascendant-shape");
    });

    it("Should NOT be Ascendant with high reputation but below Diamond activity", async function () {
      await activateModules(alice, 1, 5);
      await sendMessages(alice, 1, 2, 84); // Gold tier
      await setReputation(alice, 1, 10000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("GOLD");
      expect(svg).to.not.include("ASCENDANT");
    });

    it("Should be Ascendant at Diamond + reputation > 5000", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 6000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("ASCENDANT");
      expect(svg).to.include("#ffd4ff"); // ascendant badge color
    });

    it("Should have rainbow-shift animation on central shape", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 6000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("@keyframes rainbow-shift");
      expect(svg).to.include('class="ascendant-shape"');
    });

    it("Should have pulsing ascendant glow", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 6000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("@keyframes ascendant-pulse");
      expect(svg).to.include('class="ascendant-glow"');
    });

    it("Should have trail effect on reputation particles", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 6000);
      const svg = await renderer.renderSVG(1);
      const groupMatch = svg.match(/<g class="rep-particle-group">(.*?)<\/g>/s);
      expect(groupMatch).to.not.be.null;
      // Ascendant with rep 6000 = repLevel 4 = 15 particles, each with trail = 30 circles
      const circles = groupMatch[1].match(/<circle /g);
      expect(circles).to.have.lengthOf(30); // 15 particles + 15 trails
    });

    it("Should still include all Diamond animations", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 6000);
      const svg = await renderer.renderSVG(1);
      // All Diamond animations present
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes drift-up");
      expect(svg).to.include("@keyframes badge-glow");
      expect(svg).to.include('class="particle"');
      // Plus ascendant-specific
      expect(svg).to.include("@keyframes rainbow-shift");
      expect(svg).to.include("@keyframes ascendant-pulse");
    });

    it("Should show Ascendant badge with tier-badge class for glow animation", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 6000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include('class="tier-badge"');
      expect(svg).to.include("ASCENDANT");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  EDGE CASES
  // ═══════════════════════════════════════════════════════════════

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await setupWithMessaging();
    });

    it("Should handle reputation exactly at boundary (500)", async function () {
      await setReputation(alice, 1, 500);
      const svg = await renderer.renderSVG(1);
      // 500 is in range 1-500 (repLevel 1)
      expect(svg).to.include('r="90"');
      expect(svg).to.include('opacity="0.05"');
    });

    it("Should handle reputation exactly at boundary (501)", async function () {
      await setReputation(alice, 1, 501);
      const svg = await renderer.renderSVG(1);
      // 501 is in range 501-1500 (repLevel 2)
      expect(svg).to.include('r="105"');
      expect(svg).to.include('opacity="0.15"');
    });

    it("Should handle reputation exactly at boundary (5001) for Ascendant", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 5001);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("ASCENDANT");
    });

    it("Should handle reputation exactly at boundary (5000) — NOT Ascendant", async function () {
      this.timeout(120000);
      await reachDiamond(alice, 1, 2);
      await setReputation(alice, 1, 5000);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.include("DIAMOND");
      expect(svg).to.not.include("ASCENDANT");
    });

    it("Should handle negative reputation (no aura, no particles)", async function () {
      await setReputation(alice, 1, -500);
      const svg = await renderer.renderSVG(1);
      expect(svg).to.not.include('class="rep-aura"');
      expect(svg).to.not.include('class="rep-particle-group"');
      expect(svg).to.include("REP:-500");
    });

    it("Should combine reputation visuals with activity tier visuals", async function () {
      // Silver tier + reputation level 2
      await sendMessages(alice, 1, 2, 34); // Silver
      await setReputation(alice, 1, 1000);
      const svg = await renderer.renderSVG(1);
      // Silver tier animations
      expect(svg).to.include("@keyframes breathe");
      expect(svg).to.include("@keyframes glow-pulse");
      // Reputation visuals
      expect(svg).to.include('class="rep-aura"');
      expect(svg).to.include('class="rep-particle-group"');
      expect(svg).to.include("@keyframes rep-orbit");
      expect(svg).to.include("REP:1000");
    });
  });
});
