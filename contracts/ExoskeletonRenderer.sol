// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ExoskeletonRenderer
 * @notice Onchain SVG art generator for Exoskeleton NFTs.
 * @dev The visual identity is a DATA VISUALIZATION of the agent itself.
 *      Reputation encoded as complexity, activity as density, capabilities as color.
 *      The "art" evolves as the agent evolves.
 *
 * Visual Config Format (packed bytes, agent-configurable):
 *   [0]     baseShape:    0=hexagon, 1=circle, 2=diamond, 3=shield, 4=octagon, 5=triangle
 *   [1-3]   primaryRGB:   R, G, B (0-255 each)
 *   [4-6]   secondaryRGB: R, G, B
 *   [7]     symbol:       0=none, 1=eye, 2=gear, 3=bolt, 4=star, 5=wave, 6=node, 7=diamond
 *   [8]     pattern:      0=none, 1=grid, 2=dots, 3=lines, 4=circuits, 5=rings
 *
 * Dynamic layers (read from contract state):
 *   - Age rings: concentric layers accumulate over time (like tree rings)
 *   - Activity density: message count drives particle density
 *   - Module indicators: active modules shown as orbital nodes
 *   - Reputation glow: higher rep = more intense core glow
 *   - Genesis frame: exclusive gold border + "GENESIS" badge
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */
interface IExoskeletonCore {
    function getIdentity(uint256 tokenId) external view returns (
        string memory name,
        string memory bio,
        bytes memory visualConfig,
        string memory customVisualKey,
        uint256 mintedAt,
        bool genesis
    );
    function getReputation(uint256 tokenId) external view returns (
        uint256 messagesSent,
        uint256 storageWrites,
        uint256 modulesActive,
        uint256 age
    );
    function getReputationScore(uint256 tokenId) external view returns (uint256);
}

contract ExoskeletonRenderer is Ownable {
    using Strings for uint256;

    address public coreContract;

    constructor(address _core) Ownable(msg.sender) {
        coreContract = _core;
    }

    function setCoreContract(address _core) external onlyOwner {
        coreContract = _core;
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN RENDER FUNCTION — called by ExoskeletonCore.tokenURI()
    // ═══════════════════════════════════════════════════════════════

    function renderSVG(uint256 tokenId) external view returns (string memory) {
        IExoskeletonCore core = IExoskeletonCore(coreContract);

        (
            string memory name,
            ,
            bytes memory config,
            ,
            ,
            bool genesis
        ) = core.getIdentity(tokenId);

        (
            uint256 messagesSent,
            uint256 storageWrites,
            uint256 modulesActive,
            uint256 age
        ) = core.getReputation(tokenId);

        uint256 repScore = core.getReputationScore(tokenId);

        // Parse visual config (use defaults if config is too short)
        VisualParams memory params = _parseConfig(config, genesis);

        return _buildSVG(tokenId, name, genesis, params, messagesSent, storageWrites, modulesActive, age, repScore);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONFIG PARSING
    // ═══════════════════════════════════════════════════════════════

    struct VisualParams {
        uint8 baseShape;
        uint8 primaryR;
        uint8 primaryG;
        uint8 primaryB;
        uint8 secondaryR;
        uint8 secondaryG;
        uint8 secondaryB;
        uint8 symbol;
        uint8 pattern;
    }

    function _parseConfig(bytes memory config, bool genesis) internal pure returns (VisualParams memory p) {
        if (config.length >= 9) {
            p.baseShape = uint8(config[0]) % 6;
            p.primaryR = uint8(config[1]);
            p.primaryG = uint8(config[2]);
            p.primaryB = uint8(config[3]);
            p.secondaryR = uint8(config[4]);
            p.secondaryG = uint8(config[5]);
            p.secondaryB = uint8(config[6]);
            p.symbol = uint8(config[7]) % 8;
            p.pattern = uint8(config[8]) % 6;
        } else {
            // Defaults: genesis gets gold, standard gets cyan
            if (genesis) {
                p.primaryR = 255; p.primaryG = 215; p.primaryB = 0;   // gold
                p.secondaryR = 255; p.secondaryG = 165; p.secondaryB = 0; // orange
            } else {
                p.primaryR = 0; p.primaryG = 255; p.primaryB = 170;   // cyan-green
                p.secondaryR = 0; p.secondaryG = 170; p.secondaryB = 255; // blue
            }
            p.baseShape = 0; // hexagon
            p.symbol = 1;    // eye
            p.pattern = 0;   // none
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SVG ASSEMBLY
    // ═══════════════════════════════════════════════════════════════

    function _buildSVG(
        uint256 tokenId,
        string memory name,
        bool genesis,
        VisualParams memory p,
        uint256 msgCount,
        uint256 writes,
        uint256 modules,
        uint256 age,
        uint256 repScore
    ) internal pure returns (string memory) {
        string memory primaryColor = _rgb(p.primaryR, p.primaryG, p.primaryB);

        string memory primaryHex = _hexColor(p.primaryR, p.primaryG, p.primaryB);
        string memory secondaryHex = _hexColor(p.secondaryR, p.secondaryG, p.secondaryB);

        // Reputation drives complexity (capped at 10 for rendering)
        uint256 complexity = repScore / 100;
        if (complexity > 10) complexity = 10;

        // Age drives ring count (1 ring per ~43200 blocks, roughly 1 day on Base at 2s blocks)
        uint256 ageRings = age / 43200;
        if (ageRings > 8) ageRings = 8;

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
            _buildDefs(primaryHex, secondaryHex, primaryColor),
            _buildBackground(),
            genesis ? _buildGenesisFrame(primaryHex) : _buildStandardFrame(primaryHex),
            _buildAgeRings(ageRings, secondaryHex),
            _buildCentralShape(p.baseShape, primaryHex),
            _buildPattern(p.pattern, complexity, secondaryHex),
            _buildSymbol(p.symbol, primaryHex),
            _buildActivityNodes(modules, msgCount, writes, secondaryHex),
            _buildRepGlow(complexity, primaryHex),
            _buildText(tokenId, name, genesis, primaryHex),
            _buildStats(msgCount, writes, modules, secondaryHex),
            '</svg>'
        );
    }

    // ─── SVG Definitions (gradients, filters) ───────────────────

    function _buildDefs(string memory primary, string memory secondary, string memory primaryRgb) internal pure returns (string memory) {
        return string.concat(
            '<defs>',
            '<radialGradient id="glow"><stop offset="0%" stop-color="', primary, '" stop-opacity="0.6"/>',
            '<stop offset="100%" stop-color="', primary, '" stop-opacity="0"/></radialGradient>',
            '<radialGradient id="core-glow"><stop offset="0%" stop-color="', primary, '" stop-opacity="0.3"/>',
            '<stop offset="60%" stop-color="', secondary, '" stop-opacity="0.1"/>',
            '<stop offset="100%" stop-opacity="0"/></radialGradient>',
            '<filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>',
            '<filter id="blur-lg"><feGaussianBlur stdDeviation="8"/></filter>',
            '<filter id="glow-filter"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="', primaryRgb, '" flood-opacity="0.5"/></filter>',
            '</defs>'
        );
    }

    // ─── Background ─────────────────────────────────────────────

    function _buildBackground() internal pure returns (string memory) {
        return string.concat(
            '<rect width="500" height="500" fill="#080808"/>',
            '<rect x="0" y="0" width="500" height="500" fill="url(#core-glow)"/>'
        );
    }

    // ─── Frame ──────────────────────────────────────────────────

    function _buildGenesisFrame(string memory color) internal pure returns (string memory) {
        return string.concat(
            // Double border with genesis glow
            '<rect x="8" y="8" width="484" height="484" rx="16" fill="none" stroke="#FFD700" stroke-width="2" opacity="0.8"/>',
            '<rect x="14" y="14" width="472" height="472" rx="12" fill="none" stroke="', color, '" stroke-width="1" opacity="0.4"/>',
            // Corner accents
            '<circle cx="24" cy="24" r="4" fill="#FFD700" opacity="0.8"/>',
            '<circle cx="476" cy="24" r="4" fill="#FFD700" opacity="0.8"/>',
            '<circle cx="24" cy="476" r="4" fill="#FFD700" opacity="0.8"/>',
            '<circle cx="476" cy="476" r="4" fill="#FFD700" opacity="0.8"/>'
        );
    }

    function _buildStandardFrame(string memory color) internal pure returns (string memory) {
        return string.concat(
            '<rect x="10" y="10" width="480" height="480" rx="14" fill="none" stroke="', color, '" stroke-width="1" opacity="0.5"/>'
        );
    }

    // ─── Age Rings ──────────────────────────────────────────────

    function _buildAgeRings(uint256 ringCount, string memory color) internal pure returns (string memory) {
        if (ringCount == 0) return "";
        bytes memory rings;
        for (uint256 i = 1; i <= ringCount; i++) {
            uint256 r = 140 + i * 12;
            uint256 opacity10 = 15 + i * 5; // 20-55 range, as tenths
            rings = abi.encodePacked(
                rings,
                '<circle cx="250" cy="240" r="', r.toString(),
                '" fill="none" stroke="', color,
                '" stroke-width="0.5" opacity="0.', opacity10 < 10 ? string.concat("0", opacity10.toString()) : opacity10.toString(),
                '" stroke-dasharray="', (i * 3).toString(), " ", (i * 5).toString(), '"/>'
            );
        }
        return string(rings);
    }

    // ─── Central Shape ──────────────────────────────────────────

    function _buildCentralShape(uint8 shape, string memory color) internal pure returns (string memory) {
        // All shapes centered at (250, 240), radius ~80
        if (shape == 0) {
            // Hexagon
            return string.concat(
                '<polygon points="250,160 319,200 319,280 250,320 181,280 181,200" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 1) {
            // Circle
            return string.concat(
                '<circle cx="250" cy="240" r="80" fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 2) {
            // Diamond
            return string.concat(
                '<polygon points="250,155 340,240 250,325 160,240" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 3) {
            // Shield
            return string.concat(
                '<path d="M250,160 L330,200 L330,280 Q330,320 250,340 Q170,320 170,280 L170,200 Z" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 4) {
            // Octagon
            return string.concat(
                '<polygon points="217,160 283,160 330,207 330,273 283,320 217,320 170,273 170,207" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else {
            // Triangle
            return string.concat(
                '<polygon points="250,155 345,325 155,325" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        }
    }

    // ─── Pattern Overlay ────────────────────────────────────────

    function _buildPattern(uint8 pattern, uint256 complexity, string memory color) internal pure returns (string memory) {
        if (pattern == 0 || complexity == 0) return "";

        bytes memory elements;

        if (pattern == 1) {
            // Grid — scales with complexity
            uint256 spacing = 40 - complexity * 2; // 38 to 20
            if (spacing < 20) spacing = 20;
            for (uint256 x = 170; x <= 330; x += spacing) {
                elements = abi.encodePacked(elements,
                    '<line x1="', x.toString(), '" y1="170" x2="', x.toString(), '" y2="310" stroke="', color, '" stroke-width="0.3" opacity="0.15"/>'
                );
            }
            for (uint256 y = 170; y <= 310; y += spacing) {
                elements = abi.encodePacked(elements,
                    '<line x1="170" y1="', y.toString(), '" x2="330" y2="', y.toString(), '" stroke="', color, '" stroke-width="0.3" opacity="0.15"/>'
                );
            }
        } else if (pattern == 2) {
            // Dots — count scales with complexity
            uint256 count = complexity * 2;
            for (uint256 i = 0; i < count && i < 20; i++) {
                uint256 cx = 190 + (i * 37 % 120);
                uint256 cy = 190 + (i * 53 % 100);
                elements = abi.encodePacked(elements,
                    '<circle cx="', cx.toString(), '" cy="', cy.toString(), '" r="1.5" fill="', color, '" opacity="0.2"/>'
                );
            }
        } else if (pattern == 3) {
            // Lines — diagonal, count scales with complexity
            for (uint256 i = 0; i < complexity && i < 10; i++) {
                uint256 x = 180 + i * 15;
                elements = abi.encodePacked(elements,
                    '<line x1="', x.toString(), '" y1="170" x2="', (x + 30).toString(), '" y2="310" stroke="', color, '" stroke-width="0.3" opacity="0.12"/>'
                );
            }
        } else if (pattern == 4) {
            // Circuits — connected dots (scales with complexity)
            for (uint256 i = 0; i < complexity && i < 8; i++) {
                uint256 x1 = 200 + (i * 31 % 100);
                uint256 y1 = 200 + (i * 47 % 80);
                uint256 x2 = 200 + ((i + 1) * 31 % 100);
                uint256 y2 = 200 + ((i + 1) * 47 % 80);
                elements = abi.encodePacked(elements,
                    '<line x1="', x1.toString(), '" y1="', y1.toString(), '" x2="', x2.toString(), '" y2="', y2.toString(), '" stroke="', color, '" stroke-width="0.5" opacity="0.2"/>',
                    '<circle cx="', x1.toString(), '" cy="', y1.toString(), '" r="2" fill="', color, '" opacity="0.3"/>'
                );
            }
        } else {
            // Rings — concentric inner rings
            for (uint256 i = 1; i <= complexity && i <= 5; i++) {
                uint256 r = 20 + i * 12;
                elements = abi.encodePacked(elements,
                    '<circle cx="250" cy="240" r="', r.toString(), '" fill="none" stroke="', color, '" stroke-width="0.4" opacity="0.12"/>'
                );
            }
        }

        return string(elements);
    }

    // ─── Central Symbol ─────────────────────────────────────────

    function _buildSymbol(uint8 symbol, string memory color) internal pure returns (string memory) {
        if (symbol == 0) return "";

        if (symbol == 1) {
            // Eye — awareness, observation
            return string.concat(
                '<ellipse cx="250" cy="240" rx="20" ry="12" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>',
                '<circle cx="250" cy="240" r="5" fill="', color, '" opacity="0.6"/>'
            );
        } else if (symbol == 2) {
            // Gear — engineering, capability
            return string.concat(
                '<circle cx="250" cy="240" r="12" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>',
                '<circle cx="250" cy="240" r="5" fill="', color, '" opacity="0.4"/>',
                '<line x1="250" y1="225" x2="250" y2="255" stroke="', color, '" stroke-width="1" opacity="0.5"/>',
                '<line x1="235" y1="240" x2="265" y2="240" stroke="', color, '" stroke-width="1" opacity="0.5"/>'
            );
        } else if (symbol == 3) {
            // Bolt — energy, power
            return string.concat(
                '<polygon points="255,225 245,238 258,238 243,258" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        } else if (symbol == 4) {
            // Star — achievement
            return string.concat(
                '<polygon points="250,225 254,237 267,237 257,245 260,258 250,250 240,258 243,245 233,237 246,237" ',
                'fill="none" stroke="', color, '" stroke-width="1" opacity="0.7"/>'
            );
        } else if (symbol == 5) {
            // Wave — communication, flow
            return string.concat(
                '<path d="M230,240 Q240,228 250,240 Q260,252 270,240" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        } else if (symbol == 6) {
            // Node — network, connections
            return string.concat(
                '<circle cx="250" cy="240" r="4" fill="', color, '" opacity="0.6"/>',
                '<circle cx="238" cy="228" r="2" fill="', color, '" opacity="0.4"/>',
                '<circle cx="262" cy="228" r="2" fill="', color, '" opacity="0.4"/>',
                '<circle cx="238" cy="252" r="2" fill="', color, '" opacity="0.4"/>',
                '<circle cx="262" cy="252" r="2" fill="', color, '" opacity="0.4"/>',
                '<line x1="250" y1="240" x2="238" y2="228" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>',
                '<line x1="250" y1="240" x2="262" y2="228" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>',
                '<line x1="250" y1="240" x2="238" y2="252" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>',
                '<line x1="250" y1="240" x2="262" y2="252" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>'
            );
        } else {
            // Diamond — value, precision
            return string.concat(
                '<polygon points="250,228 260,240 250,252 240,240" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        }
    }

    // ─── Activity Nodes (orbital indicators) ────────────────────

    function _buildActivityNodes(uint256 modules, uint256 msgs, uint256 writes, string memory color) internal pure returns (string memory) {
        if (modules == 0 && msgs == 0 && writes == 0) return "";

        bytes memory nodes;

        // Module nodes — small orbiting dots (max 8)
        uint256 nodeCount = modules;
        if (nodeCount > 8) nodeCount = 8;
        for (uint256 i = 0; i < nodeCount; i++) {
            // Distribute around center at radius 110
            // Using simple angle approximation (no trig in Solidity)
            (uint256 nx, uint256 ny) = _orbitPoint(250, 240, 110, i, nodeCount);
            nodes = abi.encodePacked(nodes,
                '<circle cx="', nx.toString(), '" cy="', ny.toString(), '" r="3" fill="', color, '" opacity="0.5"/>',
                '<circle cx="', nx.toString(), '" cy="', ny.toString(), '" r="6" fill="none" stroke="', color, '" stroke-width="0.3" opacity="0.3"/>'
            );
        }

        // Message activity — small ticks on the right side
        uint256 msgIndicator = msgs;
        if (msgIndicator > 20) msgIndicator = 20;
        for (uint256 i = 0; i < msgIndicator; i++) {
            uint256 y = 180 + i * 7;
            nodes = abi.encodePacked(nodes,
                '<line x1="370" y1="', y.toString(), '" x2="375" y2="', y.toString(), '" stroke="', color, '" stroke-width="1" opacity="0.3"/>'
            );
        }

        // Storage writes — small ticks on the left side
        uint256 writeIndicator = writes;
        if (writeIndicator > 20) writeIndicator = 20;
        for (uint256 i = 0; i < writeIndicator; i++) {
            uint256 y = 180 + i * 7;
            nodes = abi.encodePacked(nodes,
                '<line x1="125" y1="', y.toString(), '" x2="130" y2="', y.toString(), '" stroke="', color, '" stroke-width="1" opacity="0.3"/>'
            );
        }

        return string(nodes);
    }

    // Simple orbit positioning without trig (8-point star positions)
    function _orbitPoint(uint256 cx, uint256 cy, uint256 radius, uint256 index, uint256 total) internal pure returns (uint256 x, uint256 y) {
        // 8 positions around center (N, NE, E, SE, S, SW, W, NW)
        uint256 pos = (index * 8 / total) % 8;
        if (pos == 0) { x = cx; y = cy - radius; }           // N
        else if (pos == 1) { x = cx + radius * 7 / 10; y = cy - radius * 7 / 10; } // NE
        else if (pos == 2) { x = cx + radius; y = cy; }      // E
        else if (pos == 3) { x = cx + radius * 7 / 10; y = cy + radius * 7 / 10; } // SE
        else if (pos == 4) { x = cx; y = cy + radius; }      // S
        else if (pos == 5) { x = cx - radius * 7 / 10; y = cy + radius * 7 / 10; } // SW
        else if (pos == 6) { x = cx - radius; y = cy; }      // W
        else { x = cx - radius * 7 / 10; y = cy - radius * 7 / 10; } // NW
    }

    // ─── Reputation Glow ────────────────────────────────────────

    function _buildRepGlow(uint256 complexity, string memory color) internal pure returns (string memory) {
        if (complexity == 0) return "";
        uint256 r = 30 + complexity * 8;
        uint256 opacity100 = 5 + complexity * 3; // 8-35 range
        return string.concat(
            '<circle cx="250" cy="240" r="', r.toString(),
            '" fill="', color, '" opacity="0.', opacity100 < 10 ? string.concat("0", opacity100.toString()) : opacity100.toString(),
            '" filter="url(#blur-lg)"/>'
        );
    }

    // ─── Text Labels ────────────────────────────────────────────

    function _buildText(uint256 tokenId, string memory name, bool genesis, string memory color) internal pure returns (string memory) {
        string memory displayName = bytes(name).length > 0 ? name : string.concat("#", tokenId.toString());

        return string.concat(
            // Name (center bottom of shape area)
            '<text x="250" y="370" fill="', color, '" font-family="monospace" font-size="16" text-anchor="middle" opacity="0.9">', displayName, '</text>',
            // Token ID (small, top right)
            '<text x="470" y="42" fill="', color, '" font-family="monospace" font-size="10" text-anchor="end" opacity="0.4">#', tokenId.toString(), '</text>',
            // "EXOSKELETON" header
            '<text x="250" y="42" fill="', color, '" font-family="monospace" font-size="8" text-anchor="middle" letter-spacing="4" opacity="0.3">EXOSKELETON</text>',
            genesis ? '<text x="250" y="395" fill="#FFD700" font-family="monospace" font-size="9" text-anchor="middle" letter-spacing="3" opacity="0.7">GENESIS</text>' : ''
        );
    }

    // ─── Stats Bar ──────────────────────────────────────────────

    function _buildStats(uint256 msgs, uint256 writes, uint256 modules, string memory color) internal pure returns (string memory) {
        return string.concat(
            // Bottom stat line
            '<text x="60" y="470" fill="', color, '" font-family="monospace" font-size="8" opacity="0.35">MSG:', msgs.toString(), '</text>',
            '<text x="180" y="470" fill="', color, '" font-family="monospace" font-size="8" opacity="0.35">STO:', writes.toString(), '</text>',
            '<text x="300" y="470" fill="', color, '" font-family="monospace" font-size="8" opacity="0.35">MOD:', modules.toString(), '</text>',
            '<line x1="40" y1="455" x2="460" y2="455" stroke="', color, '" stroke-width="0.3" opacity="0.2"/>'
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  COLOR HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _rgb(uint8 r, uint8 g, uint8 b) internal pure returns (string memory) {
        return string.concat("rgb(", uint256(r).toString(), ",", uint256(g).toString(), ",", uint256(b).toString(), ")");
    }

    function _hexColor(uint8 r, uint8 g, uint8 b) internal pure returns (string memory) {
        return string.concat("#", _toHex(r), _toHex(g), _toHex(b));
    }

    function _toHex(uint8 value) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result = new bytes(2);
        result[0] = hexChars[value >> 4];
        result[1] = hexChars[value & 0x0f];
        return string(result);
    }
}
