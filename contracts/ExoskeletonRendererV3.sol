// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ExoskeletonRendererV3
/// @notice Onchain SVG with reputation-driven visual evolution. CC0.
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
    function externalScores(uint256 tokenId, bytes32 scoreKey) external view returns (int256);
}

contract ExoskeletonRendererV3 is Ownable {
    using Strings for uint256;

    address public coreContract;

    // keccak256("composite-reputation")
    bytes32 public constant REPUTATION_KEY = 0xd98f4cc3b1a6636684588d76c091b8f9d3af09d0d60485010a123ba559716a25;

    constructor(address _core) Ownable(msg.sender) {
        coreContract = _core;
    }

    function setCoreContract(address _core) external onlyOwner {
        coreContract = _core;
    }

    // ─── Main Render ──────────────────────────────────────────

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

        // Read reputation score (safe — returns 0 if not set or call fails)
        int256 repScore = _getReputationScore(core, tokenId);

        // Parse visual config
        VisualParams memory params = _parseConfig(config, genesis);

        return _buildSVG(tokenId, name, genesis, params, messagesSent, storageWrites, modulesActive, age, repScore);
    }

    function _getReputationScore(IExoskeletonCore core, uint256 tokenId) internal view returns (int256) {
        try core.externalScores(tokenId, REPUTATION_KEY) returns (int256 score) {
            return score;
        } catch {
            return 0;
        }
    }

    // ─── Tier System ──────────────────────────────────────────

    function _getTier(uint256 activityScore) internal pure returns (uint8) {
        if (activityScore >= 1000) return 4; // Diamond
        if (activityScore >= 200)  return 3; // Gold
        if (activityScore >= 50)   return 2; // Silver
        if (activityScore >= 5)    return 1; // Copper
        return 0;                            // Dormant
    }

    // ─── Reputation Level ─────────────────────────────────────
    function _getRepLevel(int256 repScore) internal pure returns (uint8) {
        if (repScore <= 0) return 0;
        uint256 score = uint256(repScore);
        if (score > 3000) return 4;
        if (score > 1500) return 3;
        if (score > 500) return 2;
        return 1;
    }

    // ─── Config Parsing ────────────────────────────────────────

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
            if (genesis) {
                p.primaryR = 255; p.primaryG = 215; p.primaryB = 0;
                p.secondaryR = 255; p.secondaryG = 165; p.secondaryB = 0;
            } else {
                p.primaryR = 0; p.primaryG = 255; p.primaryB = 170;
                p.secondaryR = 0; p.secondaryG = 170; p.secondaryB = 255;
            }
            p.baseShape = 0;
            p.symbol = 1;
            p.pattern = 0;
        }
    }

    // ─── SVG Assembly ─────────────────────────────────────────

    function _buildSVG(
        uint256 tokenId,
        string memory name,
        bool genesis,
        VisualParams memory p,
        uint256 msgCount,
        uint256 writes,
        uint256 modules,
        uint256 age,
        int256 repScore
    ) internal pure returns (string memory) {
        string memory primaryColor = _rgb(p.primaryR, p.primaryG, p.primaryB);

        string memory primaryHex = _hexColor(p.primaryR, p.primaryG, p.primaryB);
        string memory secondaryHex = _hexColor(p.secondaryR, p.secondaryG, p.secondaryB);

        // Activity score
        uint256 activityScore = msgCount + writes * 2 + modules * 10;
        if (genesis) activityScore = activityScore * 3 / 2;

        uint8 tier = _getTier(activityScore);
        uint256 complexity;
        if (tier >= 4) complexity = 10;
        else if (tier >= 3) complexity = 8;
        else if (tier >= 2) complexity = 5;
        else if (tier >= 1) complexity = 2;

        uint256 ageRings = age / 43200;
        if (ageRings > 6) ageRings = 6;

        uint8 repLevel = _getRepLevel(repScore);

        // Ascendant: Diamond tier + reputation > 5000
        bool isAscendant = tier == 4 && repScore > 5000;

        // Blend color for aura: average of primary and secondary
        string memory auraColor = _hexColor(
            uint8((uint16(p.primaryR) + uint16(p.secondaryR)) / 2),
            uint8((uint16(p.primaryG) + uint16(p.secondaryG)) / 2),
            uint8((uint16(p.primaryB) + uint16(p.secondaryB)) / 2)
        );

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
            _buildStyle(tier, repLevel, isAscendant),
            _buildDefs(primaryHex, secondaryHex, primaryColor, tier),
            _buildBackground(),
            genesis ? _buildGenesisFrame(primaryHex) : _buildStandardFrame(primaryHex),
            _buildAgeRings(ageRings, secondaryHex, tier),
            _buildReputationAura(repLevel, auraColor),
            _buildCentralShape(p.baseShape, primaryHex, tier, isAscendant),
            _buildPart2(p, complexity, secondaryHex, primaryHex, tier, repLevel, isAscendant, tokenId, name, genesis, msgCount, writes, modules, repScore)
        );
    }

    // Split to avoid stack-too-deep
    function _buildPart2(
        VisualParams memory p,
        uint256 complexity,
        string memory secondaryHex,
        string memory primaryHex,
        uint8 tier,
        uint8 repLevel,
        bool isAscendant,
        uint256 tokenId,
        string memory name,
        bool genesis,
        uint256 msgCount,
        uint256 writes,
        uint256 modules,
        int256 repScore
    ) internal pure returns (string memory) {
        return string.concat(
            _buildPattern(p.pattern, complexity, secondaryHex),
            _buildSymbol(p.symbol, primaryHex, tier),
            _buildActivityNodes(modules, msgCount, writes, secondaryHex, tier),
            _buildRepGlow(complexity, primaryHex, tier),
            _buildParticles(tier, primaryHex, secondaryHex),
            _buildReputationParticles(repLevel, secondaryHex, isAscendant),
            _buildAscendantGlow(isAscendant, primaryHex),
            _buildText(tokenId, name, genesis, primaryHex),
            _buildTierBadge(tier, primaryHex, isAscendant),
            _buildStats(msgCount, writes, modules, secondaryHex, repScore),
            '</svg>'
        );
    }

    // ─── Animation Styles (tier-gated CSS + reputation CSS) ─────

    function _buildStyle(uint8 tier, uint8 repLevel, bool isAscendant) internal pure returns (string memory) {
        if (tier == 0 && repLevel == 0) return "";

        bytes memory css = abi.encodePacked('<style>');

        if (tier >= 1) {
            // Copper: breathe + shimmer
            css = abi.encodePacked(
                css,
                '@keyframes breathe{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.03);opacity:0.85}}',
                '.central-shape{transform-origin:250px 250px;animation:breathe 6s ease-in-out infinite}',
                '@keyframes shimmer{0%,100%{opacity:0.7}50%{opacity:0.95}}',
                '.symbol{animation:shimmer 5s ease-in-out infinite}'
            );
        }

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
                '@keyframes ring-cw{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
                '@keyframes ring-ccw{from{transform:rotate(360deg)}to{transform:rotate(0deg)}}',
                '.age-ring{transform-origin:250px 250px}'
            );
            css = abi.encodePacked(css,
                '.r1{animation:ring-cw 180s linear infinite}',
                '.r2{animation:ring-ccw 165s linear infinite}',
                '.r3{animation:ring-cw 150s linear infinite}',
                '.r4{animation:ring-ccw 135s linear infinite}'
            );
            css = abi.encodePacked(css,
                '.r5{animation:ring-cw 120s linear infinite}',
                '.r6{animation:ring-ccw 105s linear infinite}'
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

        // Reputation particle orbit animation (if rep level > 0)
        if (repLevel >= 1) {
            string memory duration;
            if (repLevel == 1) duration = "30s";
            else if (repLevel == 2) duration = "20s";
            else if (repLevel == 3) duration = "15s";
            else duration = "10s";

            css = abi.encodePacked(
                css,
                '@keyframes rep-orbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
                '.rep-particle-group{transform-origin:250px 250px;animation:rep-orbit ', duration, ' linear infinite}'
            );
        }

        // Ascendant-specific animations
        if (isAscendant) {
            css = abi.encodePacked(
                css,
                '@keyframes rainbow-shift{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}',
                '.ascendant-shape{animation:rainbow-shift 8s linear infinite}',
                '@keyframes ascendant-pulse{0%,100%{opacity:0.3}50%{opacity:0.15}}',
                '.ascendant-glow{animation:ascendant-pulse 3s ease-in-out infinite}'
            );
        }

        css = abi.encodePacked(css, '</style>');
        return string(css);
    }

    // ─── SVG Definitions (gradients, filters) ───────────────────

    function _buildDefs(string memory primary, string memory secondary, string memory primaryRgb, uint8 tier) internal pure returns (string memory) {
        string memory glowFilter;
        if (tier >= 4) {
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
            '<rect x="8" y="8" width="484" height="484" rx="16" fill="none" stroke="#FFD700" stroke-width="2" opacity="0.8"/>',
            '<rect x="14" y="14" width="472" height="472" rx="12" fill="none" stroke="', color, '" stroke-width="1" opacity="0.4"/>',
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
            return _buildRotatingRings(ringCount, color);
        }

        bytes memory rings;
        for (uint256 i = 1; i <= ringCount; i++) {
            uint256 r = 140 + i * 12;
            uint256 opacity10 = 25 + i * 5;
            rings = abi.encodePacked(
                rings,
                '<circle cx="250" cy="250" r="', r.toString(),
                '" fill="none" stroke="', color,
                '" stroke-width="1.5" opacity="0.', opacity10 < 10 ? string.concat("0", opacity10.toString()) : opacity10.toString(),
                '" stroke-dasharray="', (i * 3).toString(), " ", (i * 5).toString(), '"/>'
            );
        }
        return string(rings);
    }

    function _buildRotatingRings(uint256 ringCount, string memory color) internal pure returns (string memory) {
        bytes memory result;
        for (uint256 i = 1; i <= ringCount; i++) {
            result = abi.encodePacked(
                result,
                '<g class="age-ring r', i.toString(), '">',
                _buildSingleRing(i, color),
                '</g>'
            );
        }
        return string(result);
    }

    function _buildSingleRing(uint256 i, string memory color) internal pure returns (bytes memory) {
        uint256 r = 140 + i * 12;
        uint256 opacity10 = 25 + i * 5;
        return abi.encodePacked(
            '<circle cx="250" cy="250" r="', r.toString(),
            '" fill="none" stroke="', color,
            '" stroke-width="1.5" opacity="0.', opacity10 < 10 ? string.concat("0", opacity10.toString()) : opacity10.toString(),
            '" stroke-dasharray="', (i * 3).toString(), " ", (i * 5).toString(), '"/>'
        );
    }

    // ─── Reputation Aura (NEW in V3) ────────────────────────────

    function _buildReputationAura(uint8 repLevel, string memory auraColor) internal pure returns (string memory) {
        if (repLevel == 0) return "";

        uint256 extraRadius;
        string memory opacity;

        if (repLevel == 1) { extraRadius = 10; opacity = "0.05"; }
        else if (repLevel == 2) { extraRadius = 25; opacity = "0.15"; }
        else if (repLevel == 3) { extraRadius = 40; opacity = "0.25"; }
        else { extraRadius = 60; opacity = "0.35"; }

        uint256 r = 80 + extraRadius; // base shape radius ~80

        return string.concat(
            '<circle class="rep-aura" cx="250" cy="250" r="', r.toString(),
            '" fill="', auraColor,
            '" opacity="', opacity,
            '" filter="url(#blur-lg)"/>'
        );
    }

    // ─── Central Shape ──────────────────────────────────────────

    function _buildCentralShape(uint8 shape, string memory color, uint8 tier, bool isAscendant) internal pure returns (string memory) {
        string memory ss = string.concat('fill="none" stroke="', color, '" stroke-width="2" filter="url(#glow-filter)"/>');
        string memory shapeElement;

        if (shape == 0) {
            shapeElement = string.concat('<polygon points="250,170 319,210 319,290 250,330 181,290 181,210" ', ss);
        } else if (shape == 1) {
            shapeElement = string.concat('<circle cx="250" cy="250" r="80" ', ss);
        } else if (shape == 2) {
            shapeElement = string.concat('<polygon points="250,165 340,250 250,335 160,250" ', ss);
        } else if (shape == 3) {
            shapeElement = string.concat('<path d="M250,170 L330,210 L330,290 Q330,330 250,350 Q170,330 170,290 L170,210 Z" ', ss);
        } else if (shape == 4) {
            shapeElement = string.concat('<polygon points="217,170 283,170 330,217 330,283 283,330 217,330 170,283 170,217" ', ss);
        } else {
            shapeElement = string.concat('<polygon points="250,165 345,335 155,335" ', ss);
        }

        // Ascendant: wrap in rainbow-shift group
        if (isAscendant) {
            return string.concat('<g class="central-shape"><g class="ascendant-shape">', shapeElement, '</g></g>');
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
            uint256 spacing = 40 - complexity * 2;
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
            uint256 count = complexity * 2;
            for (uint256 i = 0; i < count && i < 20; i++) {
                uint256 cx = 190 + (i * 37 % 120);
                uint256 cy = 200 + (i * 53 % 100);
                elements = abi.encodePacked(elements,
                    '<circle cx="', cx.toString(), '" cy="', cy.toString(), '" r="1.5" fill="', color, '" opacity="0.2"/>'
                );
            }
        } else if (pattern == 3) {
            for (uint256 i = 0; i < complexity && i < 10; i++) {
                uint256 x = 180 + i * 15;
                elements = abi.encodePacked(elements,
                    '<line x1="', x.toString(), '" y1="180" x2="', (x + 30).toString(), '" y2="320" stroke="', color, '" stroke-width="0.3" opacity="0.12"/>'
                );
            }
        } else if (pattern == 4) {
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
            symbolElement = string.concat(
                '<ellipse cx="250" cy="250" rx="20" ry="12" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>',
                '<circle cx="250" cy="250" r="5" fill="', color, '" opacity="0.6"/>'
            );
        } else if (symbol == 2) {
            symbolElement = string.concat(
                '<circle cx="250" cy="250" r="12" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>',
                '<circle cx="250" cy="250" r="5" fill="', color, '" opacity="0.4"/>',
                '<line x1="250" y1="235" x2="250" y2="265" stroke="', color, '" stroke-width="1" opacity="0.5"/>',
                '<line x1="235" y1="250" x2="265" y2="250" stroke="', color, '" stroke-width="1" opacity="0.5"/>'
            );
        } else if (symbol == 3) {
            symbolElement = string.concat(
                '<polygon points="255,235 245,248 258,248 243,268" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        } else if (symbol == 4) {
            symbolElement = string.concat(
                '<polygon points="250,235 254,247 267,247 257,255 260,268 250,260 240,268 243,255 233,247 246,247" ',
                'fill="none" stroke="', color, '" stroke-width="1" opacity="0.7"/>'
            );
        } else if (symbol == 5) {
            symbolElement = string.concat(
                '<path d="M230,250 Q240,238 250,250 Q260,262 270,250" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        } else if (symbol == 6) {
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
            symbolElement = string.concat(
                '<polygon points="250,238 260,250 250,262 240,250" fill="none" stroke="', color, '" stroke-width="1.5" opacity="0.7"/>'
            );
        }

        if (tier >= 1) {
            return string.concat('<g class="symbol">', symbolElement, '</g>');
        }
        return symbolElement;
    }

    // ─── Activity Nodes ─────────────────────────────────────────

    function _buildActivityNodes(uint256 modules, uint256 msgs, uint256 writes, string memory color, uint8 tier) internal pure returns (string memory) {
        if (modules == 0 && msgs == 0 && writes == 0) return "";

        bytes memory nodes;

        uint256 nodeCount = modules;
        if (nodeCount > 8) nodeCount = 8;
        for (uint256 i = 0; i < nodeCount; i++) {
            (uint256 nx, uint256 ny) = _orbitPoint(250, 250, 110, i, nodeCount);
            if (tier >= 2) {
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

        uint256 msgIndicator = msgs;
        if (msgIndicator > 20) msgIndicator = 20;
        for (uint256 i = 0; i < msgIndicator; i++) {
            uint256 y = 190 + i * 7;
            nodes = abi.encodePacked(nodes,
                '<line x1="370" y1="', y.toString(), '" x2="375" y2="', y.toString(), '" stroke="', color, '" stroke-width="1" opacity="0.3"/>'
            );
        }

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

    function _orbitPoint(uint256 cx, uint256 cy, uint256 radius, uint256 index, uint256 total) internal pure returns (uint256 x, uint256 y) {
        uint256 pos = (index * 8 / total) % 8;
        if (pos == 0) { x = cx; y = cy - radius; }
        else if (pos == 1) { x = cx + radius * 7 / 10; y = cy - radius * 7 / 10; }
        else if (pos == 2) { x = cx + radius; y = cy; }
        else if (pos == 3) { x = cx + radius * 7 / 10; y = cy + radius * 7 / 10; }
        else if (pos == 4) { x = cx; y = cy + radius; }
        else if (pos == 5) { x = cx - radius * 7 / 10; y = cy + radius * 7 / 10; }
        else if (pos == 6) { x = cx - radius; y = cy; }
        else { x = cx - radius * 7 / 10; y = cy - radius * 7 / 10; }
    }

    // ─── Reputation Glow (V2 existing) ──────────────────────────

    function _buildRepGlow(uint256 complexity, string memory color, uint8 tier) internal pure returns (string memory) {
        if (complexity == 0) return "";
        uint256 r = 30 + complexity * 8;
        uint256 opacity100 = 5 + complexity * 3;

        if (tier >= 2) {
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

    // ─── Particles (Diamond only — V2 existing) ─────────────────

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

    // ─── Reputation Particles (NEW in V3) ───────────────────────

    function _buildReputationParticles(uint8 repLevel, string memory color, bool isAscendant) internal pure returns (string memory) {
        if (repLevel == 0) return "";

        uint256 count;
        if (repLevel == 1) count = 3;
        else if (repLevel == 2) count = 6;
        else if (repLevel == 3) count = 10;
        else count = 15;

        // Build particles positioned around a circle at radius 100
        // Wrapped in a rotating group
        bytes memory particles;
        for (uint256 i = 0; i < count; i++) {
            (uint256 px, uint256 py) = _repParticlePos(i, count);
            // Vary radius between 2 and 3
            string memory r = i % 2 == 0 ? "2" : "3";
            // Vary opacity between 0.2 and 0.5
            uint256 opacityVal = 20 + (i * 7 % 30); // 20-49 range
            string memory opacity = string.concat("0.", opacityVal < 10 ? string.concat("0", opacityVal.toString()) : opacityVal.toString());

            if (isAscendant) {
                // Trail effect: extra smaller circle behind each particle
                particles = abi.encodePacked(particles,
                    '<circle cx="', px.toString(), '" cy="', py.toString(),
                    '" r="', r, '" fill="', color, '" opacity="', opacity, '"/>',
                    '<circle cx="', px.toString(), '" cy="', (py + 4).toString(),
                    '" r="1" fill="', color, '" opacity="0.1"/>'
                );
            } else {
                particles = abi.encodePacked(particles,
                    '<circle cx="', px.toString(), '" cy="', py.toString(),
                    '" r="', r, '" fill="', color, '" opacity="', opacity, '"/>'
                );
            }
        }

        return string.concat('<g class="rep-particle-group">', string(particles), '</g>');
    }

    function _repParticlePos(uint256 index, uint256 total) internal pure returns (uint256 x, uint256 y) {
        return _orbitPoint(250, 250, 100, index, total);
    }

    // ─── Ascendant Extra Glow (NEW in V3) ───────────────────────

    function _buildAscendantGlow(bool isAscendant, string memory color) internal pure returns (string memory) {
        if (!isAscendant) return "";

        return string.concat(
            '<circle class="ascendant-glow" cx="250" cy="250" r="130" fill="', color,
            '" opacity="0.3" filter="url(#blur-lg)"/>'
        );
    }

    // ─── Tier Badge ─────────────────────────────────────────────

    function _buildTierBadge(uint8 tier, string memory, bool isAscendant) internal pure returns (string memory) {
        if (tier == 0 && !isAscendant) return "";

        string memory tierColor;
        string memory tierName;
        string memory badgeClass;

        if (isAscendant) {
            tierColor = "#ffd4ff";
            tierName = "ASCENDANT";
            badgeClass = ' class="tier-badge"';
        } else if (tier == 1) {
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
            '<text x="250" y="380" fill="', color, '" font-family="monospace" font-size="16" text-anchor="middle" opacity="0.9">', displayName, '</text>',
            '<text x="470" y="42" fill="', color, '" font-family="monospace" font-size="10" text-anchor="end" opacity="0.4">#', tokenId.toString(), '</text>',
            '<text x="250" y="42" fill="', color, '" font-family="monospace" font-size="8" text-anchor="middle" letter-spacing="4" opacity="0.3">EXOSKELETON</text>',
            genesis ? '<text x="250" y="405" fill="#FFD700" font-family="monospace" font-size="9" text-anchor="middle" letter-spacing="3" opacity="0.7">GENESIS</text>' : ''
        );
    }

    // ─── Stats Bar (V3: adds REP) ───────────────────────────────

    function _buildStats(uint256 msgs, uint256 writes, uint256 modules, string memory color, int256 repScore) internal pure returns (string memory) {
        string memory repStr;
        if (repScore < 0) {
            repStr = string.concat("-", uint256(-repScore).toString());
        } else {
            repStr = uint256(repScore).toString();
        }

        return string.concat(
            '<text x="40" y="470" fill="', color, '" font-family="monospace" font-size="8" opacity="0.35">MSG:', msgs.toString(), '</text>',
            '<text x="140" y="470" fill="', color, '" font-family="monospace" font-size="8" opacity="0.35">STO:', writes.toString(), '</text>',
            '<text x="240" y="470" fill="', color, '" font-family="monospace" font-size="8" opacity="0.35">MOD:', modules.toString(), '</text>',
            '<text x="340" y="470" fill="', color, '" font-family="monospace" font-size="8" opacity="0.35">REP:', repStr, '</text>',
            '<line x1="40" y1="455" x2="460" y2="455" stroke="', color, '" stroke-width="0.3" opacity="0.2"/>'
        );
    }

    // ─── Color Helpers ────────────────────────────────────────

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
