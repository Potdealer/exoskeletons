// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ExoskeletonRendererV2
 * @notice Animated onchain SVG art generator for Exoskeleton NFTs.
 * @dev V2 adds tier-gated CSS keyframe animations that unlock as reputation grows.
 *      Deploy and call core.setRenderer(v2) — V1 stays deployed as instant rollback.
 *
 * Tier System (activity-based — age drives rings, activity drives animations):
 *   Activity = messages + (writes × 2) + (modules × 10), genesis gets 1.5×
 *   Dormant  (0)      — Static SVG, identical to V1
 *   Copper   (5+)     — Breathing shape, symbol shimmer
 *   Silver   (50+)    — + Pulsing glow, activity node pulse
 *   Gold     (200+)   — + Rotating age rings (3 groups, different speeds)
 *   Diamond  (1000+)  — + Drifting particles, tier badge glow, enhanced glow filter
 *
 * Each tier includes all animations from tiers below it.
 * Age contributes orbital rings (1 per day, cosmetic). Activity drives art evolution.
 *
 * Visual Config Format (packed bytes, agent-configurable):
 *   [0]     baseShape:    0=hexagon, 1=circle, 2=diamond, 3=shield, 4=octagon, 5=triangle
 *   [1-3]   primaryRGB:   R, G, B (0-255 each)
 *   [4-6]   secondaryRGB: R, G, B
 *   [7]     symbol:       0=none, 1=eye, 2=gear, 3=bolt, 4=star, 5=wave, 6=node, 7=diamond
 *   [8]     pattern:      0=none, 1=grid, 2=dots, 3=lines, 4=circuits, 5=rings
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
}

contract ExoskeletonRendererV2 is Ownable {
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

        // Parse visual config (use defaults if config is too short)
        VisualParams memory params = _parseConfig(config, genesis);

        return _buildSVG(tokenId, name, genesis, params, messagesSent, storageWrites, modulesActive, age);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TIER SYSTEM
    // ═══════════════════════════════════════════════════════════════

    function _getTier(uint256 activityScore) internal pure returns (uint8) {
        if (activityScore >= 1000) return 4; // Diamond
        if (activityScore >= 200)  return 3; // Gold
        if (activityScore >= 50)   return 2; // Silver
        if (activityScore >= 5)    return 1; // Copper
        return 0;                            // Dormant
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
        uint256 age
    ) internal pure returns (string memory) {
        string memory primaryColor = _rgb(p.primaryR, p.primaryG, p.primaryB);

        string memory primaryHex = _hexColor(p.primaryR, p.primaryG, p.primaryB);
        string memory secondaryHex = _hexColor(p.secondaryR, p.secondaryG, p.secondaryB);

        // Activity score: what you DO drives animations (genesis gets 1.5x)
        uint256 activityScore = msgCount + writes * 2 + modules * 10;
        if (genesis) activityScore = activityScore * 3 / 2;

        // Tier from activity, complexity from tier
        uint8 tier = _getTier(activityScore);
        uint256 complexity;
        if (tier >= 4) complexity = 10;
        else if (tier >= 3) complexity = 8;
        else if (tier >= 2) complexity = 5;
        else if (tier >= 1) complexity = 2;

        // Age drives ring count (1 ring per ~43200 blocks, roughly 1 day on Base at 2s blocks)
        uint256 ageRings = age / 43200;
        if (ageRings > 8) ageRings = 8;

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
            _buildStyle(tier),
            _buildDefs(primaryHex, secondaryHex, primaryColor, tier),
            _buildBackground(),
            genesis ? _buildGenesisFrame(primaryHex) : _buildStandardFrame(primaryHex),
            _buildAgeRings(ageRings, secondaryHex, tier),
            _buildCentralShape(p.baseShape, primaryHex, tier),
            _buildPattern(p.pattern, complexity, secondaryHex),
            _buildSymbol(p.symbol, primaryHex, tier),
            _buildActivityNodes(modules, msgCount, writes, secondaryHex, tier),
            _buildRepGlow(complexity, primaryHex, tier),
            _buildParticles(tier, primaryHex, secondaryHex),
            _buildText(tokenId, name, genesis, primaryHex),
            _buildTierBadge(tier, primaryHex),
            _buildStats(msgCount, writes, modules, secondaryHex),
            '</svg>'
        );
    }

    // ─── Animation Styles (tier-gated CSS) ────────────────────────

    function _buildStyle(uint8 tier) internal pure returns (string memory) {
        if (tier == 0) return "";

        // Copper (tier >= 1): breathe + shimmer
        bytes memory css = abi.encodePacked(
            '<style>',
            '@keyframes breathe{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.03);opacity:0.85}}',
            '.central-shape{transform-origin:250px 250px;animation:breathe 6s ease-in-out infinite}',
            '@keyframes shimmer{0%,100%{opacity:0.7}50%{opacity:0.95}}',
            '.symbol{animation:shimmer 5s ease-in-out infinite}'
        );

        if (tier >= 2) {
            // Silver: + glow-pulse + node-pulse
            css = abi.encodePacked(
                css,
                '@keyframes glow-pulse{0%,100%{opacity:0.35}50%{opacity:0.18}}',
                '.rep-glow{animation:glow-pulse 4s ease-in-out infinite}',
                '@keyframes node-pulse{0%,100%{r:3;opacity:0.5}50%{r:5;opacity:0.8}}',
                '.activity-node{animation:node-pulse 3s ease-in-out infinite}'
            );
        }

        if (tier >= 3) {
            // Gold: + ring rotation
            css = abi.encodePacked(
                css,
                '@keyframes ring-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
                '@keyframes ring-rotate-rev{from{transform:rotate(360deg)}to{transform:rotate(0deg)}}',
                '.age-ring-group{transform-origin:250px 250px}',
                '.ring-cw{animation:ring-rotate 120s linear infinite}'
            );
            css = abi.encodePacked(
                css,
                '.ring-ccw{animation:ring-rotate-rev 90s linear infinite}',
                '.ring-cw-slow{animation:ring-rotate 180s linear infinite}'
            );
        }

        if (tier >= 4) {
            // Diamond: + drift-up + badge-glow
            css = abi.encodePacked(
                css,
                '@keyframes drift-up{0%{transform:translateY(0px);opacity:0.4}100%{transform:translateY(-60px);opacity:0}}',
                '.particle{animation:drift-up 8s ease-out infinite}',
                '@keyframes badge-glow{0%,100%{opacity:0.8}50%{opacity:0.5}}',
                '.tier-badge{animation:badge-glow 3s ease-in-out infinite}'
            );
        }

        css = abi.encodePacked(css, '</style>');
        return string(css);
    }

    // ─── SVG Definitions (gradients, filters) ───────────────────

    function _buildDefs(string memory primary, string memory secondary, string memory primaryRgb, uint8 tier) internal pure returns (string memory) {
        string memory glowFilter;
        if (tier >= 4) {
            // Diamond: enhanced glow
            glowFilter = string.concat(
                '<filter id="glow-filter"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="', primaryRgb, '" flood-opacity="0.7"/></filter>'
            );
        } else {
            glowFilter = string.concat(
                '<filter id="glow-filter"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="', primaryRgb, '" flood-opacity="0.5"/></filter>'
            );
        }

        return string.concat(
            '<defs>',
            '<radialGradient id="glow"><stop offset="0%" stop-color="', primary, '" stop-opacity="0.6"/>',
            '<stop offset="100%" stop-color="', primary, '" stop-opacity="0"/></radialGradient>',
            '<radialGradient id="core-glow"><stop offset="0%" stop-color="', primary, '" stop-opacity="0.3"/>',
            '<stop offset="60%" stop-color="', secondary, '" stop-opacity="0.1"/>',
            '<stop offset="100%" stop-opacity="0"/></radialGradient>',
            '<filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>',
            '<filter id="blur-lg"><feGaussianBlur stdDeviation="8"/></filter>',
            glowFilter,
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

    function _buildAgeRings(uint256 ringCount, string memory color, uint8 tier) internal pure returns (string memory) {
        if (ringCount == 0) return "";

        if (tier >= 3) {
            // Gold+: wrap rings in 3 rotating groups
            return _buildRotatingRings(ringCount, color);
        }

        // Below Gold: static rings (same as V1)
        bytes memory rings;
        for (uint256 i = 1; i <= ringCount; i++) {
            uint256 r = 140 + i * 12;
            uint256 opacity10 = 15 + i * 5; // 20-55 range, as tenths
            rings = abi.encodePacked(
                rings,
                '<circle cx="250" cy="250" r="', r.toString(),
                '" fill="none" stroke="', color,
                '" stroke-width="0.5" opacity="0.', opacity10 < 10 ? string.concat("0", opacity10.toString()) : opacity10.toString(),
                '" stroke-dasharray="', (i * 3).toString(), " ", (i * 5).toString(), '"/>'
            );
        }
        return string(rings);
    }

    function _buildRotatingRings(uint256 ringCount, string memory color) internal pure returns (string memory) {
        // Group 1: rings 1-3 (clockwise, 120s)
        bytes memory group1;
        for (uint256 i = 1; i <= ringCount && i <= 3; i++) {
            group1 = abi.encodePacked(group1, _buildSingleRing(i, color));
        }

        // Group 2: rings 4-5 (counter-clockwise, 90s)
        bytes memory group2;
        for (uint256 i = 4; i <= ringCount && i <= 5; i++) {
            group2 = abi.encodePacked(group2, _buildSingleRing(i, color));
        }

        // Group 3: rings 6-8 (clockwise slow, 180s)
        bytes memory group3;
        for (uint256 i = 6; i <= ringCount && i <= 8; i++) {
            group3 = abi.encodePacked(group3, _buildSingleRing(i, color));
        }

        bytes memory result;
        if (group1.length > 0) {
            result = abi.encodePacked('<g class="age-ring-group ring-cw">', group1, '</g>');
        }
        if (group2.length > 0) {
            result = abi.encodePacked(result, '<g class="age-ring-group ring-ccw">', group2, '</g>');
        }
        if (group3.length > 0) {
            result = abi.encodePacked(result, '<g class="age-ring-group ring-cw-slow">', group3, '</g>');
        }

        return string(result);
    }

    function _buildSingleRing(uint256 i, string memory color) internal pure returns (bytes memory) {
        uint256 r = 140 + i * 12;
        uint256 opacity10 = 15 + i * 5;
        return abi.encodePacked(
            '<circle cx="250" cy="250" r="', r.toString(),
            '" fill="none" stroke="', color,
            '" stroke-width="0.5" opacity="0.', opacity10 < 10 ? string.concat("0", opacity10.toString()) : opacity10.toString(),
            '" stroke-dasharray="', (i * 3).toString(), " ", (i * 5).toString(), '"/>'
        );
    }

    // ─── Central Shape ──────────────────────────────────────────

    function _buildCentralShape(uint8 shape, string memory color, uint8 tier) internal pure returns (string memory) {
        string memory shapeElement;

        // All shapes centered at (250, 250), radius ~80
        if (shape == 0) {
            // Hexagon
            shapeElement = string.concat(
                '<polygon points="250,170 319,210 319,290 250,330 181,290 181,210" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 1) {
            // Circle
            shapeElement = string.concat(
                '<circle cx="250" cy="250" r="80" fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 2) {
            // Diamond
            shapeElement = string.concat(
                '<polygon points="250,165 340,250 250,335 160,250" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 3) {
            // Shield
            shapeElement = string.concat(
                '<path d="M250,170 L330,210 L330,290 Q330,330 250,350 Q170,330 170,290 L170,210 Z" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else if (shape == 4) {
            // Octagon
            shapeElement = string.concat(
                '<polygon points="217,170 283,170 330,217 330,283 283,330 217,330 170,283 170,217" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        } else {
            // Triangle
            shapeElement = string.concat(
                '<polygon points="250,165 345,335 155,335" ',
                'fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>'
            );
        }

        // Copper+: wrap in breathing group
        if (tier >= 1) {
            return string.concat('<g class="central-shape">', shapeElement, '</g>');
        }
        return shapeElement;
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
                    '<line x1="', x.toString(), '" y1="180" x2="', x.toString(), '" y2="320" stroke="', color, '" stroke-width="0.3" opacity="0.15"/>'
                );
            }
            for (uint256 y = 180; y <= 320; y += spacing) {
                elements = abi.encodePacked(elements,
                    '<line x1="170" y1="', y.toString(), '" x2="330" y2="', y.toString(), '" stroke="', color, '" stroke-width="0.3" opacity="0.15"/>'
                );
            }
        } else if (pattern == 2) {
            // Dots — count scales with complexity
            uint256 count = complexity * 2;
            for (uint256 i = 0; i < count && i < 20; i++) {
                uint256 cx = 190 + (i * 37 % 120);
                uint256 cy = 200 + (i * 53 % 100);
                elements = abi.encodePacked(elements,
                    '<circle cx="', cx.toString(), '" cy="', cy.toString(), '" r="1.5" fill="', color, '" opacity="0.2"/>'
                );
            }
        } else if (pattern == 3) {
            // Lines — diagonal, count scales with complexity
            for (uint256 i = 0; i < complexity && i < 10; i++) {
                uint256 x = 180 + i * 15;
                elements = abi.encodePacked(elements,
                    '<line x1="', x.toString(), '" y1="180" x2="', (x + 30).toString(), '" y2="320" stroke="', color, '" stroke-width="0.3" opacity="0.12"/>'
                );
            }
        } else if (pattern == 4) {
            // Circuits — connected dots (scales with complexity)
            for (uint256 i = 0; i < complexity && i < 8; i++) {
                uint256 x1 = 200 + (i * 31 % 100);
                uint256 y1 = 210 + (i * 47 % 80);
                uint256 x2 = 200 + ((i + 1) * 31 % 100);
                uint256 y2 = 210 + ((i + 1) * 47 % 80);
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
                    '<circle cx="250" cy="250" r="', r.toString(), '" fill="none" stroke="', color, '" stroke-width="0.4" opacity="0.12"/>'
                );
            }
        }

        return string(elements);
    }

    // ─── Central Symbol ─────────────────────────────────────────

    function _buildSymbol(uint8 symbol, string memory color, uint8 tier) internal pure returns (string memory) {
        if (symbol == 0) return "";

        string memory symbolElement;

        if (symbol == 1) {
            // Eye — awareness, observation
            symbolElement = string.concat(
                '<ellipse cx="250" cy="250" rx="20" ry="12" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>',
                '<circle cx="250" cy="250" r="5" fill="', color, '" opacity="0.6"/>'
            );
        } else if (symbol == 2) {
            // Gear — engineering, capability
            symbolElement = string.concat(
                '<circle cx="250" cy="250" r="12" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>',
                '<circle cx="250" cy="250" r="5" fill="', color, '" opacity="0.4"/>',
                '<line x1="250" y1="235" x2="250" y2="265" stroke="', color, '" stroke-width="1" opacity="0.5"/>',
                '<line x1="235" y1="250" x2="265" y2="250" stroke="', color, '" stroke-width="1" opacity="0.5"/>'
            );
        } else if (symbol == 3) {
            // Bolt — energy, power
            symbolElement = string.concat(
                '<polygon points="255,235 245,248 258,248 243,268" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        } else if (symbol == 4) {
            // Star — achievement
            symbolElement = string.concat(
                '<polygon points="250,235 254,247 267,247 257,255 260,268 250,260 240,268 243,255 233,247 246,247" ',
                'fill="none" stroke="', color, '" stroke-width="1" opacity="0.7"/>'
            );
        } else if (symbol == 5) {
            // Wave — communication, flow
            symbolElement = string.concat(
                '<path d="M230,250 Q240,238 250,250 Q260,262 270,250" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        } else if (symbol == 6) {
            // Node — network, connections
            symbolElement = string.concat(
                '<circle cx="250" cy="250" r="4" fill="', color, '" opacity="0.6"/>',
                '<circle cx="238" cy="238" r="2" fill="', color, '" opacity="0.4"/>',
                '<circle cx="262" cy="238" r="2" fill="', color, '" opacity="0.4"/>',
                '<circle cx="238" cy="262" r="2" fill="', color, '" opacity="0.4"/>',
                '<circle cx="262" cy="262" r="2" fill="', color, '" opacity="0.4"/>',
                '<line x1="250" y1="250" x2="238" y2="238" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>',
                '<line x1="250" y1="250" x2="262" y2="238" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>',
                '<line x1="250" y1="250" x2="238" y2="262" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>',
                '<line x1="250" y1="250" x2="262" y2="262" stroke="', color, '" stroke-width="0.5" opacity="0.3"/>'
            );
        } else {
            // Diamond — value, precision
            symbolElement = string.concat(
                '<polygon points="250,238 260,250 250,262 240,250" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        }

        // Copper+: wrap in shimmer group
        if (tier >= 1) {
            return string.concat('<g class="symbol">', symbolElement, '</g>');
        }
        return symbolElement;
    }

    // ─── Activity Nodes (orbital indicators) ────────────────────

    function _buildActivityNodes(uint256 modules, uint256 msgs, uint256 writes, string memory color, uint8 tier) internal pure returns (string memory) {
        if (modules == 0 && msgs == 0 && writes == 0) return "";

        bytes memory nodes;

        // Module nodes — small orbiting dots (max 8)
        uint256 nodeCount = modules;
        if (nodeCount > 8) nodeCount = 8;
        for (uint256 i = 0; i < nodeCount; i++) {
            // Distribute around center at radius 110
            (uint256 nx, uint256 ny) = _orbitPoint(250, 250, 110, i, nodeCount);
            if (tier >= 2) {
                // Silver+: pulsing activity nodes
                nodes = abi.encodePacked(nodes,
                    '<circle class="activity-node" cx="', nx.toString(), '" cy="', ny.toString(), '" r="3" fill="', color, '" opacity="0.5"/>',
                    '<circle cx="', nx.toString(), '" cy="', ny.toString(), '" r="6" fill="none" stroke="', color, '" stroke-width="0.3" opacity="0.3"/>'
                );
            } else {
                nodes = abi.encodePacked(nodes,
                    '<circle cx="', nx.toString(), '" cy="', ny.toString(), '" r="3" fill="', color, '" opacity="0.5"/>',
                    '<circle cx="', nx.toString(), '" cy="', ny.toString(), '" r="6" fill="none" stroke="', color, '" stroke-width="0.3" opacity="0.3"/>'
                );
            }
        }

        // Message activity — small ticks on the right side
        uint256 msgIndicator = msgs;
        if (msgIndicator > 20) msgIndicator = 20;
        for (uint256 i = 0; i < msgIndicator; i++) {
            uint256 y = 190 + i * 7;
            nodes = abi.encodePacked(nodes,
                '<line x1="370" y1="', y.toString(), '" x2="375" y2="', y.toString(), '" stroke="', color, '" stroke-width="1" opacity="0.3"/>'
            );
        }

        // Storage writes — small ticks on the left side
        uint256 writeIndicator = writes;
        if (writeIndicator > 20) writeIndicator = 20;
        for (uint256 i = 0; i < writeIndicator; i++) {
            uint256 y = 190 + i * 7;
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

    function _buildRepGlow(uint256 complexity, string memory color, uint8 tier) internal pure returns (string memory) {
        if (complexity == 0) return "";
        uint256 r = 30 + complexity * 8;
        uint256 opacity100 = 5 + complexity * 3; // 8-35 range

        if (tier >= 2) {
            // Silver+: pulsing glow
            return string.concat(
                '<circle class="rep-glow" cx="250" cy="250" r="', r.toString(),
                '" fill="', color, '" opacity="0.', opacity100 < 10 ? string.concat("0", opacity100.toString()) : opacity100.toString(),
                '" filter="url(#blur-lg)"/>'
            );
        }

        return string.concat(
            '<circle cx="250" cy="250" r="', r.toString(),
            '" fill="', color, '" opacity="0.', opacity100 < 10 ? string.concat("0", opacity100.toString()) : opacity100.toString(),
            '" filter="url(#blur-lg)"/>'
        );
    }

    // ─── Particles (Diamond only) ───────────────────────────────

    function _buildParticles(uint8 tier, string memory primaryHex, string memory secondaryHex) internal pure returns (string memory) {
        if (tier < 4) return "";

        return string.concat(
            '<circle class="particle" cx="220" cy="290" r="1.5" fill="', primaryHex, '" opacity="0.4"/>',
            '<circle class="particle" cx="270" cy="300" r="1" fill="', secondaryHex, '" opacity="0.3" style="animation-delay:1.5s"/>',
            '<circle class="particle" cx="240" cy="280" r="1.2" fill="', primaryHex, '" opacity="0.35" style="animation-delay:3s"/>',
            '<circle class="particle" cx="260" cy="295" r="0.8" fill="', secondaryHex, '" opacity="0.25" style="animation-delay:4.5s"/>',
            '<circle class="particle" cx="235" cy="305" r="1.3" fill="', primaryHex, '" opacity="0.3" style="animation-delay:6s"/>'
        );
    }

    // ─── Tier Badge ─────────────────────────────────────────────

    function _buildTierBadge(uint8 tier, string memory) internal pure returns (string memory) {
        if (tier == 0) return "";

        string memory tierColor;
        string memory tierName;
        string memory badgeClass;

        if (tier == 1) {
            tierColor = "#cd7f32";
            tierName = "COPPER";
            badgeClass = "";
        } else if (tier == 2) {
            tierColor = "#c0c0c0";
            tierName = "SILVER";
            badgeClass = "";
        } else if (tier == 3) {
            tierColor = "#ffd700";
            tierName = "GOLD";
            badgeClass = "";
        } else {
            tierColor = "#b9f2ff";
            tierName = "DIAMOND";
            badgeClass = ' class="tier-badge"';
        }

        return string.concat(
            '<text', badgeClass, ' x="250" y="425" fill="', tierColor,
            '" font-family="monospace" font-size="7" text-anchor="middle" letter-spacing="2" opacity="0.8">',
            unicode'◆', ' ', tierName, ' ', unicode'◆',
            '</text>'
        );
    }

    // ─── Text Labels ────────────────────────────────────────────

    function _buildText(uint256 tokenId, string memory name, bool genesis, string memory color) internal pure returns (string memory) {
        string memory displayName = bytes(name).length > 0 ? name : string.concat("#", tokenId.toString());

        return string.concat(
            // Name (center bottom of shape area)
            '<text x="250" y="380" fill="', color, '" font-family="monospace" font-size="16" text-anchor="middle" opacity="0.9">', displayName, '</text>',
            // Token ID (small, top right)
            '<text x="470" y="42" fill="', color, '" font-family="monospace" font-size="10" text-anchor="end" opacity="0.4">#', tokenId.toString(), '</text>',
            // "EXOSKELETON" header
            '<text x="250" y="42" fill="', color, '" font-family="monospace" font-size="8" text-anchor="middle" letter-spacing="4" opacity="0.3">EXOSKELETON</text>',
            genesis ? '<text x="250" y="405" fill="#FFD700" font-family="monospace" font-size="9" text-anchor="middle" letter-spacing="3" opacity="0.7">GENESIS</text>' : ''
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
