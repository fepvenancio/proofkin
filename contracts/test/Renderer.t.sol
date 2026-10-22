// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LibString} from "solady/utils/LibString.sol";
import {Renderer} from "../src/Renderer.sol";
import {VM} from "../src/VM.sol";
import {Prog} from "./helpers/Prog.sol";

/// @notice `Renderer.render` (PLAN.md §6.1). Positions are checked against numbers worked out by
///         hand from the layout rules, not copied from the output.
///
/// Layout recap used below: canvas 600x600, centre (300,300). Layer d has radius
/// 40 + d * (240 / (maxDepth + 1)). The k-th of m nodes in layer d sits at angle
/// seed[d % 32] * 360/256 degrees + k * 360/m. Edges are quadratic Beziers from operand to node
/// whose control point is the chord midpoint pulled 30% towards the centre.
contract RendererTest is Test {
    Renderer r = new Renderer();

    bytes32 constant ZERO = bytes32(0);

    function _count(string memory subject, string memory needle) private pure returns (uint256 n) {
        uint256 pos = LibString.indexOf(subject, needle);
        while (pos != LibString.NOT_FOUND) {
            ++n;
            pos = LibString.indexOf(subject, needle, pos + bytes(needle).length);
        }
    }

    function _has(string memory subject, string memory needle) private pure returns (bool) {
        return LibString.contains(subject, needle);
    }

    function _svg(bytes memory program, bytes32 seed) private view returns (string memory) {
        return r.render(program, seed);
    }

    /// @dev CONST 255 as the only node of a QUORUM7 program.
    function _single() private pure returns (bytes memory) {
        return Prog.build(Prog.QUORUM7, Prog.konst(255), Prog.out(0));
    }

    // -------------------------------------------------------------- the frame

    function test_frame() public view {
        string memory svg = _svg(_single(), ZERO);
        assertTrue(
            LibString.startsWith(
                svg,
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">'
            ),
            "opens with the 600x600 canvas"
        );
        assertTrue(LibString.endsWith(svg, "</svg>"), "closes");
        assertTrue(_has(svg, '<g id="rings"'), "rings group");
        assertTrue(_has(svg, '<g id="edges"'), "edges group");
        assertTrue(_has(svg, '<g id="nodes">'), "nodes group");
        assertTrue(_has(svg, '<g id="halos">'), "halos group");
        assertTrue(_has(svg, "radialGradient"), "background gradient");
    }

    function test_noScriptsAndNoExternalReferences() public view {
        string memory svg = _svg(_single(), ZERO);
        assertFalse(_has(svg, "<script"), "script");
        assertFalse(_has(svg, "onload"), "event handler");
        assertFalse(_has(svg, "href"), "link");
        assertFalse(_has(svg, "<image"), "embedded image");
        assertEq(_count(svg, "http"), 1, "only the xmlns declaration mentions a URL");
    }

    function test_isDeterministicAndSeedDependent() public view {
        bytes memory p = _single();
        assertEq(_svg(p, ZERO), _svg(p, ZERO));
        assertTrue(
            keccak256(bytes(_svg(p, ZERO))) != keccak256(bytes(_svg(p, Prog.seedWithByte(0, 1))))
        );
    }

    // ------------------------------------------------ hand-checked layouts

    /// One CONST 255 node: layer 0 alone, ring radius 40 (240 / 1 spacing is unused), angle 0.
    /// 255 -> size 4 + log2(256) = 12 -> square half-side 9, centred on (340, 300).
    function test_singleNode() public view {
        string memory svg = _svg(_single(), ZERO);
        assertTrue(
            _has(svg, '<rect class="c" x="331" y="291" width="18" height="18"/>'),
            "square at (340,300)"
        );
        assertTrue(
            _has(
                svg,
                '<circle class="o" r="40"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/></circle>'
            ),
            "ring 0"
        );
        assertEq(_count(svg, '<path d="M'), 0, "no edges");
        assertTrue(
            _has(
                svg,
                '<circle class="h" cx="340" cy="300" r="16"><animate attributeName="r" values="16;20;16" dur="2.4s" repeatCount="indefinite"/></circle>'
            ),
            "the output node has a pulsing halo"
        );
    }

    /// seed[0] = 0x40 turns layer 0 by 64 * 360/256 = 90 degrees; two nodes are 180 apart.
    /// Node 0 at 90 deg -> (300, 340); node 1 at 270 deg -> (300, 260).
    function test_layerOffsetComesFromTheSeed() public view {
        bytes memory p = Prog.build(
            Prog.SORT8, bytes.concat(Prog.konst(255), Prog.konst(255)), Prog.alt(0, 1, 8)
        );
        string memory svg = _svg(p, Prog.seedWithByte(0, 0x40));
        assertTrue(
            _has(svg, '<rect class="c" x="291" y="331" width="18" height="18"/>'),
            "node 0 at (300,340)"
        );
        assertTrue(
            _has(svg, '<rect class="c" x="291" y="251" width="18" height="18"/>'),
            "node 1 at (300,260)"
        );
    }

    /// n0 = CONST 255, n1 = CONST 3 (layer 0, two nodes), n2 = ADD n0 n1 (layer 1).
    /// maxDepth 1 -> spacing 240 / 2 = 120 -> rings at r = 40 and 160.
    /// n0 (340,300), n1 (260,300), n2 (460,300).
    /// Control points: chord midpoints (400,300) and (360,300), pulled 30% to (300,300):
    ///   (370,300) and (342,300).
    function _twoLayers() private pure returns (bytes memory) {
        bytes memory nodes =
            bytes.concat(Prog.konst(255), Prog.konst(3), Prog.node(Prog.ADD, 0, 1, 0));
        return Prog.build(Prog.QUORUM7, nodes, Prog.out(2));
    }

    function test_twoLayers_ringsAndDirections() public view {
        string memory svg = _svg(_twoLayers(), ZERO);
        assertEq(_count(svg, 'class="o"'), 2, "one ring per layer");
        assertTrue(_has(svg, '<circle class="o" r="40"><animateTransform'), "ring 0 radius");
        assertTrue(_has(svg, '<circle class="o" r="160"><animateTransform'), "ring 1 radius");
        assertTrue(
            _has(svg, 'from="360" to="0" dur="27s"'), "ring 1 turns the other way, period 20 + 7"
        );
        assertTrue(_has(svg, 'from="0" to="360" dur="20s"'), "ring 0 turns forward, period 20");
    }

    function test_twoLayers_edgesGoFromOperandToNode() public view {
        string memory svg = _svg(_twoLayers(), ZERO);
        assertTrue(_has(svg, '<path d="M340 300Q370 300 460 300"/>'), "n0 -> n2");
        assertTrue(_has(svg, '<path d="M260 300Q342 300 460 300"/>'), "n1 -> n2");
        assertEq(_count(svg, '<path d="M'), 2);
    }

    function test_twoLayers_glyphsAndSizes() public view {
        string memory svg = _svg(_twoLayers(), ZERO);
        assertTrue(
            _has(svg, '<rect class="c" x="331" y="291" width="18" height="18"/>'),
            "255 -> size 12 -> half-side 9"
        );
        assertTrue(
            _has(svg, '<rect class="c" x="256" y="296" width="8" height="8"/>'),
            "3 -> size 6 -> half-side 4"
        );
        assertTrue(
            _has(svg, '<circle class="a" cx="460" cy="300" r="12"/>'),
            "258 -> size 12 circle at (460,300)"
        );
        assertEq(_count(svg, 'class="h"'), 1, "only n2 is an output");
    }

    // ------------------------------------------------------------ glyph families

    function test_oneGlyphPerOpFamily() public view {
        bytes memory nodes = bytes.concat(
            Prog.node(Prog.IN, 0, 0, 0), // 0 input   -> dot
            Prog.konst(255), // 1 constant -> square
            Prog.node(Prog.ADD, 0, 1, 0) // 2 arithmetic -> circle
        );
        nodes = bytes.concat(
            nodes,
            Prog.node(Prog.MIN, 2, 1, 0), // 3 compare -> diamond
            Prog.node(Prog.AND, 3, 2, 0), // 4 logic -> ring
            Prog.node(Prog.SEL, 4, 3, 2) // 5 select -> triangle
        );
        string memory svg = _svg(Prog.build(Prog.QUORUM7, nodes, Prog.out(5)), ZERO);

        assertEq(_count(svg, 'class="i"'), 1, "dot");
        assertEq(_count(svg, 'class="c"'), 1, "square");
        assertEq(_count(svg, 'class="a"'), 1, "circle");
        assertEq(_count(svg, 'class="m"'), 1, "diamond");
        assertEq(_count(svg, 'class="l"'), 1, "ring");
        assertEq(_count(svg, 'class="s"'), 1, "triangle");
        assertEq(_count(svg, '<path d="M'), 9, "2 + 2 + 2 + 3 operand edges");
    }

    function test_diamondAndTriangleShapes() public view {
        // n0 CONST 255 at (340,300), n1 MIN n0 n0 (value 255, size 12) at layer 1 (460,300),
        // n2 SEL n1 n0 n0 (value 255, size 12) at layer 2: maxDepth 2 -> spacing 80 -> r = 200 -> (500,300)
        bytes memory nodes = bytes.concat(
            Prog.konst(255), Prog.node(Prog.MIN, 0, 0, 0), Prog.node(Prog.SEL, 1, 0, 0)
        );
        string memory svg = _svg(Prog.build(Prog.QUORUM7, nodes, Prog.out(2)), ZERO);
        // MIN at layer 1: r = 40 + 80 = 120 -> (420,300): diamond M x (y-s) l s s -s s -s -s z
        assertTrue(_has(svg, '<path class="m" d="M420 288l12 12-12 12-12-12z"/>'), "diamond");
        // SEL at layer 2: r = 200 -> (500,300): triangle M x (y-s) l s 2s h -2s z
        assertTrue(_has(svg, '<path class="s" d="M500 288l12 24h-24z"/>'), "triangle");
    }

    function test_aRepeatedOperandIsDrawnOnce() public view {
        bytes memory nodes = bytes.concat(Prog.konst(7), Prog.node(Prog.SEL, 0, 0, 0));
        assertEq(
            _count(_svg(Prog.build(Prog.QUORUM7, nodes, Prog.out(1)), ZERO), '<path d="M'),
            1,
            "SEL x x x"
        );

        nodes = bytes.concat(Prog.konst(7), Prog.konst(9), Prog.node(Prog.SEL, 0, 1, 1));
        assertEq(
            _count(_svg(Prog.build(Prog.QUORUM7, nodes, Prog.out(2)), ZERO), '<path d="M'),
            2,
            "SEL x y y"
        );
    }

    // -------------------------------------------------------------- sizes

    /// Glyph size is 4 + floor(log2(value + 1)), capped at 16: values 0, 1, 255, 65535 give 4, 5, 12, 16.
    function test_sizeFollowsLog2OfTheValue() public view {
        bytes memory nodes =
            bytes.concat(Prog.konst(0), Prog.konst(1), Prog.konst(255), Prog.konst(65_535));
        nodes = bytes.concat(
            nodes,
            Prog.node(Prog.ADD, 0, 0, 0), // 4: 0
            Prog.node(Prog.ADD, 1, 0, 0), // 5: 1
            Prog.node(Prog.ADD, 2, 0, 0), // 6: 255
            Prog.node(Prog.ADD, 3, 0, 0) // 7: 65535
        );
        bytes memory outs = abi.encodePacked(
            uint8(4), uint8(5), uint8(6), uint8(7), uint8(4), uint8(5), uint8(6), uint8(7)
        );
        string memory svg = _svg(Prog.build(Prog.SORT8, nodes, outs), ZERO);

        assertEq(_count(svg, 'r="4"/>'), 1, "value 0");
        assertEq(_count(svg, 'r="5"/>'), 1, "value 1");
        assertEq(_count(svg, 'r="12"/>'), 1, "value 255");
        assertEq(_count(svg, 'r="16"/>'), 1, "value 65535 is capped at 16, not 20");
    }

    function test_aDotIsHalfTheSizeOfItsValue() public view {
        // IN 0 under zero seed: QUORUM7 votes are 0 or 1, so size is 4 or 5 and the dot radius 2 or 3.
        string memory svg =
            _svg(Prog.build(Prog.QUORUM7, Prog.node(Prog.IN, 0, 0, 0), Prog.out(0)), ZERO);
        assertTrue(_has(svg, 'r="2"/>') || _has(svg, 'r="3"/>'), "dot");
        assertTrue(_has(svg, '<circle class="i" cx="340" cy="300"'), "input dot at (340,300)");
    }

    // -------------------------------------------------------------- halos

    function test_haloPerDistinctOutputNode() public view {
        bytes memory nodes = bytes.concat(Prog.konst(255), Prog.konst(255));
        // 8 slots over 2 nodes: two halos, not eight
        assertEq(
            _count(_svg(Prog.build(Prog.SORT8, nodes, Prog.alt(0, 1, 8)), ZERO), 'class="h"'), 2
        );
    }

    // ------------------------------------------------------- many layers

    /// 64 nodes in a chain: depth 63, so 64 layers, spacing 240 / 64 = 3 and the last ring at 40 + 63*3 = 229.
    function test_deepChainHasOneRingPerLayer() public view {
        string memory svg = _svg(Prog.build(Prog.QUORUM7, Prog.addChain(64), Prog.out(63)), ZERO);
        assertEq(_count(svg, 'class="o"'), 64);
        assertTrue(_has(svg, '<circle class="o" r="229">'), "outermost ring");
        assertTrue(_has(svg, '<circle class="o" r="40">'), "innermost ring");
    }

    /// Layers beyond 31 read seed[d % 32] (a 32-byte seed has no byte 40). Layer 40 has radius
    /// 40 + 40*3 = 160 and one node, so seed[8] = 0x40 puts it at 90 degrees: (300, 460).
    function test_layersPast31ReuseTheSeedBytes() public view {
        string memory svg = _svg(
            Prog.build(Prog.QUORUM7, Prog.addChain(64), Prog.out(63)), Prog.seedWithByte(8, 0x40)
        );
        assertTrue(_has(svg, "M300 460Q"), "layer 40 node is at (300,460)");
    }

    // ------------------------------------------------------------ palettes

    /// @dev A one-node program for `puzzle`; the zero-filled output slots all point at node 0.
    function _onePuzzle(uint8 puzzle) private view returns (string memory) {
        bytes memory outs = new bytes(puzzle == 2 ? 8 : puzzle == 5 ? 4 : 1);
        return _svg(Prog.build(puzzle, Prog.konst(255), outs), ZERO);
    }

    function test_eachPuzzleHasItsOwnPalette() public view {
        uint16[6] memory baseHue = [190, 28, 265, 135, 340, 48];
        for (uint8 p; p < 6; ++p) {
            string memory svg = _onePuzzle(p);
            assertTrue(
                _has(svg, string.concat("hsl(", LibString.toString(baseHue[p]), ",")), "base hue"
            );
        }
    }

    /// The hue shifts by uint8(seed[31]) % 30 degrees.
    function test_hueShiftsBySeedLastByteModulo30() public view {
        bytes memory p = _single();
        assertTrue(_has(_svg(p, ZERO), "hsl(190,"), "shift 0");
        assertTrue(_has(_svg(p, Prog.seedWithByte(31, 7)), "hsl(197,"), "shift 7");
        assertTrue(_has(_svg(p, Prog.seedWithByte(31, 29)), "hsl(219,"), "shift 29");
        assertTrue(_has(_svg(p, Prog.seedWithByte(31, 30)), "hsl(190,"), "30 wraps to 0");
        assertFalse(_has(_svg(p, Prog.seedWithByte(31, 30)), "hsl(220,"), "30 must not shift by 30");
        assertTrue(_has(_svg(p, Prog.seedWithByte(31, 255)), "hsl(205,"), "255 % 30 = 15");
    }

    // ------------------------------------------------------------ inputs

    function test_aProgramThatFailsTheTrialStillRenders() public view {
        // SUB of IN 0 (0 or 1) and CONST 255 underflows on trial 2: values stay 0 from that node on.
        bytes memory nodes = bytes.concat(
            Prog.node(Prog.IN, 0, 0, 0), Prog.konst(255), Prog.node(Prog.SUB, 0, 1, 0)
        );
        string memory svg = _svg(Prog.build(Prog.QUORUM7, nodes, Prog.out(2)), ZERO);
        assertTrue(LibString.endsWith(svg, "</svg>"));
        assertTrue(_has(svg, 'class="a"'));
    }

    function test_rejectsProgramsThatFailValidation() public {
        bytes memory wrongVersion = _single();
        wrongVersion[0] = 0x02;
        vm.expectRevert(VM.BadVersion.selector);
        r.render(wrongVersion, ZERO);

        // two nodes, only node 0 is an output: node 1 is dead
        bytes memory nodes = bytes.concat(Prog.konst(1), Prog.konst(2));
        bytes memory dead = Prog.build(Prog.QUORUM7, nodes, Prog.out(0));
        vm.expectRevert(abi.encodeWithSelector(VM.DeadNode.selector, 1));
        r.render(dead, ZERO);
    }
}
