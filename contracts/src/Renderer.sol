// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base64} from "solady/utils/Base64.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {LibString} from "solady/utils/LibString.sol";
import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {IProofkin} from "./IProofkin.sol";
import {Puzzles} from "./Puzzles.sol";
import {VM} from "./VM.sol";

/// @title Renderer
/// @notice Draws a Proofkin program as an animated SVG (PLAN.md §6). Everything is integer math, so
///         the output is deterministic and fully on-chain. The SVG uses SMIL and CSS only.
///
/// @dev Layout (canvas 600x600, centre (300,300)):
///      - The program runs on `Puzzles.inputs(puzzleId, seed, 2)` and the node values size the glyphs.
///      - Node depth is 0 for IN/CONST, else 1 + the deepest operand. Layer d is a ring of radius
///        `40 + d * (240 / layers)`, `layers = maxDepth + 1`.
///      - The k-th of m nodes in a layer sits at `seed[d % 32] * 360/256 + k * 360/m` degrees
///        (a 32-byte seed has no byte 40, so deeper layers reuse the bytes).
///      - An edge is a quadratic Bezier from operand to node; its control point is the chord midpoint
///        pulled 30% towards the centre. Repeated operands of one node are drawn once.
///      - Glyph by op family: IN dot, CONST square, arithmetic circle, compare diamond, logic ring,
///        select triangle. Size is `min(16, 4 + floor(log2(value + 1)))` px.
///      - Rings are drawn as dashed orbit tracks that rotate (alternating direction, period 20 + 7d
///        seconds). The graph itself stays still so that edges stay attached to their nodes: two
///        rings turning at different speeds would tear every edge between them off its endpoints.
contract Renderer {
    error BufferOverflow();
    error NoSuchToken();

    /// @dev Output buffer size. The SVG of any valid 64-node program must stay under 40,000 bytes;
    ///      the tests render the worst cases and assert it.
    uint256 private constant BUF_CAP = 48_000;

    /// @dev Working text: the final name and description are an owner decision (PLAN.md §11).
    string private constant DESCRIPTION = "A solved puzzle: the program that solved it, verified and stored fully on-chain. "
        "The art is drawn from the program's structure and one run of it.";

    /// @dev Drawn just inside the canvas edge on tokens that currently hold their puzzle's record.
    string private constant GOLD_RING =
        '<circle cx="300" cy="300" r="292" fill="none" stroke="hsl(46,85%,58%)" stroke-opacity=".6" stroke-width="2"/>\n';

    // sin(k * 90deg / 64) * 10000 for k = 0..64, sixteen uint16 entries per word.
    uint256 private constant SIN_0 =
        0x000000f501eb02e003d404c805bb06ae079f088f097e0a6b0b570c410d290e0f;
    uint256 private constant SIN_1 =
        0x0ef30fd410b41190126a1341141514e615b4167e1745180818c819841a3c1aef;
    uint256 private constant SIN_2 =
        0x1b9f1c4a1cf21d941e321ecb1f601ff0207b2101218121fd227322e4235023b6;
    uint256 private constant SIN_3 =
        0x2417247224c72517256125a625e4261d2650267d26a426c526e026f52704270d;
    uint256 private constant SIN_4 =
        0x2710000000000000000000000000000000000000000000000000000000000000;

    /// @dev op families, indexed into the class letters "icamls".
    uint256 private constant INPUT = 0;
    uint256 private constant CONSTANT = 1;
    uint256 private constant ARITHMETIC = 2;
    uint256 private constant COMPARE = 3;
    uint256 private constant LOGIC = 4;
    uint256 private constant SELECT = 5;

    struct Layout {
        uint256 n;
        uint256 layers;
        uint256[] depth;
        uint256[] value;
        uint256[] x;
        uint256[] y;
    }

    struct Buf {
        bytes data;
        uint256 len;
    }

    /// @notice Preview a program without minting it. Reverts with a `VM` error if it is not valid.
    function render(bytes calldata program, bytes32 seed) external pure returns (string memory) {
        return _render(program, seed, false);
    }

    function _render(bytes memory program, bytes32 seed, bool optimal)
        private
        pure
        returns (string memory)
    {
        VM.validate(program);
        Layout memory l = _layout(program, seed);

        Buf memory out = Buf(new bytes(BUF_CAP), 0);
        _header(out, uint8(program[1]), seed, optimal);
        _rings(out, l);
        _edges(out, program, l);
        _nodes(out, program, l);
        _halos(out, program, l);
        _put(out, "</svg>");

        bytes memory data = out.data;
        uint256 len = out.len;
        assembly ("memory-safe") {
            mstore(data, len)
        }
        return string(data);
    }

    /// @notice Metadata for token `id` of the calling collection; Proofkin.tokenURI forwards here.
    /// @dev The token is read back from `msg.sender`, so call this through the collection. "Optimal"
    ///      is live: the token's node count against the collection's current best for its puzzle,
    ///      so it changes when a smaller solution is minted. Tokens with it get a gold outer ring.
    function tokenURI(uint256 id) external view returns (string memory) {
        IProofkin collection = IProofkin(msg.sender);
        IProofkin.Token memory t = collection.tokens(id);
        if (t.program == address(0)) revert NoSuchToken();

        bytes memory program = SSTORE2.read(t.program);
        bool optimal = t.nodeCount == collection.bestNodes(t.puzzleId);
        string memory image = Base64.encode(bytes(_render(program, t.seed, optimal)));

        string memory json = string.concat(
            '{"name":"Proofkin #', LibString.toString(id), '","description":"', DESCRIPTION
        );
        json = string.concat(json, '","attributes":', _attributes(t, program, optimal));
        json = string.concat(json, ',"image":"data:image/svg+xml;base64,', image, '"}');
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _attributes(IProofkin.Token memory t, bytes memory program, bool optimal)
        private
        pure
        returns (string memory)
    {
        string memory a = string.concat(
            "[",
            _text("Puzzle", _puzzleName(t.puzzleId)),
            ",",
            _number("Nodes", t.nodeCount),
            ",",
            _number("Depth", t.depth)
        );
        a = string.concat(
            a, ",", _number("Solve rank", t.rank), ",", _text("First Solver", _yesNo(t.rank == 1))
        );
        a = string.concat(
            a,
            ",",
            _text("Record Setter", _yesNo(t.recordAtMint)),
            ",",
            _text("Optimal", _yesNo(optimal))
        );
        return string.concat(a, ",", _text("Dominant op family", _dominantFamily(program)), "]");
    }

    function _text(string memory trait, string memory value) private pure returns (string memory) {
        return string.concat('{"trait_type":"', trait, '","value":"', value, '"}');
    }

    function _number(string memory trait, uint256 value) private pure returns (string memory) {
        return string.concat(
            '{"trait_type":"',
            trait,
            '","display_type":"number","value":',
            LibString.toString(value),
            "}"
        );
    }

    function _yesNo(bool b) private pure returns (string memory) {
        return b ? "Yes" : "No";
    }

    function _puzzleName(uint256 puzzleId) private pure returns (string memory) {
        if (puzzleId == 0) return "QUORUM7";
        if (puzzleId == 1) return "MEDIAN5";
        if (puzzleId == 2) return "SORT8";
        if (puzzleId == 3) return "GRID_PATH";
        if (puzzleId == 4) return "KNAPSACK3";
        return "FAIR_SPLIT4";
    }

    /// @dev The most common of arithmetic, compare, logic and select by node count; a tie goes to
    ///      the earlier of those, and "None" means the program is only IN and CONST nodes.
    function _dominantFamily(bytes memory program) private pure returns (string memory) {
        uint256[6] memory counts;
        for (uint256 i; i < uint8(program[2]); ++i) {
            ++counts[_family(uint8(program[4 + 4 * i]))];
        }
        uint256 best;
        uint256 winner;
        for (uint256 f = ARITHMETIC; f <= SELECT; ++f) {
            if (counts[f] > best) (best, winner) = (counts[f], f);
        }
        if (best == 0) return "None";
        if (winner == ARITHMETIC) return "Arithmetic";
        if (winner == COMPARE) return "Compare";
        if (winner == LOGIC) return "Logic";
        return "Select";
    }

    // ------------------------------------------------------------------ layout

    function _layout(bytes memory program, bytes32 seed) private pure returns (Layout memory l) {
        uint256 n = uint8(program[2]);
        l.n = n;
        l.depth = VM.depths(program);
        (,, l.value) = VM.run(program, Puzzles.inputs(uint8(program[1]), seed, 2));

        uint256 layers = 1;
        for (uint256 i; i < n; ++i) {
            if (l.depth[i] + 1 > layers) layers = l.depth[i] + 1;
        }
        l.layers = layers;

        uint256[] memory total = new uint256[](layers);
        for (uint256 i; i < n; ++i) {
            ++total[l.depth[i]];
        }

        uint256[] memory placed = new uint256[](layers);
        uint256 spacing = 240 / layers;
        l.x = new uint256[](n);
        l.y = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            uint256 d = l.depth[i];
            // Angles are in 1/4096 turns: a seed byte is byte/256 of a turn = byte * 16 units.
            uint256 angle =
                (uint256(uint8(seed[d % 32])) * 16 + placed[d]++ * 4096 / total[d]) % 4096;
            (l.x[i], l.y[i]) = _point(40 + d * spacing, angle);
        }
    }

    /// @dev Pixel position of (radius, angle) around (300,300); angle is in 1/4096 turns, y grows downwards.
    function _point(uint256 radius, uint256 angle) private pure returns (uint256 px, uint256 py) {
        uint256 rem = angle & 1023;
        int256 s = int256(_quarterSin(rem)); // sin(phi)
        int256 c = int256(_quarterSin(1024 - rem)); // cos(phi)

        // theta = quadrant * 90deg + phi
        uint256 quadrant = angle >> 10;
        int256 cosT;
        int256 sinT;
        if (quadrant == 0) (cosT, sinT) = (c, s);
        else if (quadrant == 1) (cosT, sinT) = (-s, c);
        else if (quadrant == 2) (cosT, sinT) = (-c, -s);
        else (cosT, sinT) = (s, -c);

        px = _place(radius, cosT);
        py = _place(radius, sinT);
    }

    /// @dev 300 + round(radius * unit / 10000), for unit in [-10000, 10000].
    function _place(uint256 radius, int256 unit) private pure returns (uint256) {
        // floor((v + 5000) / 10000) done on a positive number, then shifted back
        int256 offset = (int256(radius) * unit + 5000 + 10_000_000) / 10_000 - 1000;
        return uint256(300 + offset);
    }

    /// @dev sin(x * 90deg / 1024) * 10000 for x in 0..1024, by linear interpolation of a 65-entry table.
    function _quarterSin(uint256 x) private pure returns (uint256) {
        uint256 i = x >> 4;
        uint256 lo = _sinEntry(i);
        if (i == 64) return lo;
        uint256 hi = _sinEntry(i + 1);
        return lo + ((hi - lo) * (x & 15)) / 16;
    }

    function _sinEntry(uint256 i) private pure returns (uint256) {
        uint256 w = i >> 4;
        uint256 word = w == 0 ? SIN_0 : w == 1 ? SIN_1 : w == 2 ? SIN_2 : w == 3 ? SIN_3 : SIN_4;
        return (word >> (16 * (15 - (i & 15)))) & 0xffff;
    }

    // ------------------------------------------------------------------ palette

    /// @dev (base hue, hue step between op families, saturation %, lightness %) for each puzzle.
    function _palette(uint256 puzzleId) private pure returns (uint256, uint256, uint256, uint256) {
        if (puzzleId == 0) return (190, 48, 70, 66);
        if (puzzleId == 1) return (28, 36, 80, 62);
        if (puzzleId == 2) return (265, 52, 65, 70);
        if (puzzleId == 3) return (135, 44, 60, 62);
        if (puzzleId == 4) return (340, 40, 78, 66);
        return (48, 58, 85, 60);
    }

    function _hsl(Buf memory out, uint256 hue, uint256 sat, uint256 light) private pure {
        _put(out, "hsl(");
        _num(out, hue % 360);
        _put(out, ",");
        _num(out, sat);
        _put(out, "%,");
        _num(out, light);
        _put(out, "%)");
    }

    // ------------------------------------------------------------------ svg parts

    function _header(Buf memory out, uint256 puzzleId, bytes32 seed, bool optimal) private pure {
        (uint256 base, uint256 step, uint256 sat, uint256 light) = _palette(puzzleId);
        base += uint8(seed[31]) % 30; // the hue shifts by seed[31] % 30 degrees

        _put(
            out,
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">\n'
        );
        _put(out, '<defs><radialGradient id="g"><stop offset="0" stop-color="');
        _hsl(out, base, 45, 15);
        _put(out, '"/><stop offset="1" stop-color="');
        _hsl(out, base, 55, 4);
        _put(out, '"/></radialGradient></defs>\n<style>');

        _put(out, ".e{fill:none;stroke:");
        _hsl(out, base, 50, 70);
        _put(
            out,
            ";stroke-opacity:.75;stroke-width:1.2;stroke-dasharray:5 7;animation:f 2s linear infinite}"
        );
        _put(out, "@keyframes f{to{stroke-dashoffset:-12}}.o{fill:none;stroke:");
        _hsl(out, base, 30, 70);
        _put(out, ";stroke-opacity:.5;stroke-dasharray:1 8}.h{fill:none;stroke:");
        _hsl(out, base + step, 90, 88);
        _put(out, ";stroke-width:1.5}");

        // one fill per op family: input, constant, arithmetic, compare, logic, select
        bytes6 classes = "icamls";
        for (uint256 f; f < 6; ++f) {
            _put(out, ".");
            _put(out, abi.encodePacked(classes[f]));
            if (f == LOGIC) {
                _put(out, "{fill:none;stroke-width:2.5;stroke:");
            } else {
                _put(out, "{fill:");
            }
            _hsl(out, base + f * step, sat, light);
            _put(out, "}");
        }
        _put(out, '</style>\n<rect width="600" height="600" fill="url(#g)"/>\n');
        if (optimal) _put(out, bytes(GOLD_RING));
    }

    function _rings(Buf memory out, Layout memory l) private pure {
        _put(out, '<g id="rings" transform="translate(300 300)">\n');
        uint256 spacing = 240 / l.layers;
        for (uint256 d; d < l.layers; ++d) {
            _put(out, '<circle class="o" r="');
            _num(out, 40 + d * spacing);
            // even layers turn clockwise, odd layers the other way
            (bytes memory from, bytes memory to) =
                d % 2 == 0 ? (bytes("0"), bytes("360")) : (bytes("360"), bytes("0"));
            _put(out, '"><animateTransform attributeName="transform" type="rotate" from="');
            _put(out, from);
            _put(out, '" to="');
            _put(out, to);
            _put(out, '" dur="');
            _num(out, 20 + 7 * d);
            _put(out, 's" repeatCount="indefinite"/></circle>\n');
        }
        _put(out, "</g>\n");
    }

    function _edges(Buf memory out, bytes memory program, Layout memory l) private pure {
        _put(out, '<g id="edges" class="e">\n');
        for (uint256 i; i < l.n; ++i) {
            uint256 off = 4 + 4 * i;
            uint256 op = uint8(program[off]);
            if (op == VM.IN || op == VM.CONST) continue;

            uint256 a = uint8(program[off + 1]);
            uint256 b = uint8(program[off + 2]);
            _edge(out, l, a, i);
            if (b != a) _edge(out, l, b, i);
            if (op == VM.SEL) {
                uint256 c = uint8(program[off + 3]);
                if (c != a && c != b) _edge(out, l, c, i);
            }
        }
        _put(out, "</g>\n");
    }

    function _edge(Buf memory out, Layout memory l, uint256 from, uint256 to) private pure {
        uint256 x1 = l.x[from];
        uint256 y1 = l.y[from];
        uint256 x2 = l.x[to];
        uint256 y2 = l.y[to];
        // control point = chord midpoint pulled 30% towards (300,300): (7 * (p1 + p2) + 1800) / 20, rounded
        _put(out, '<path d="M');
        _num(out, x1);
        _put(out, " ");
        _num(out, y1);
        _put(out, "Q");
        _num(out, (7 * (x1 + x2) + 1810) / 20);
        _put(out, " ");
        _num(out, (7 * (y1 + y2) + 1810) / 20);
        _put(out, " ");
        _num(out, x2);
        _put(out, " ");
        _num(out, y2);
        _put(out, '"/>\n');
    }

    function _nodes(Buf memory out, bytes memory program, Layout memory l) private pure {
        _put(out, '<g id="nodes">\n');
        for (uint256 i; i < l.n; ++i) {
            _glyph(out, uint8(program[4 + 4 * i]), l.x[i], l.y[i], _size(l.value[i]));
        }
        _put(out, "</g>\n");
    }

    /// @dev min(16, 4 + floor(log2(value + 1))).
    function _size(uint256 value) private pure returns (uint256) {
        uint256 s = 4 + FixedPointMathLib.log2(value + 1);
        return s > 16 ? 16 : s;
    }

    function _family(uint256 op) private pure returns (uint256) {
        if (op == VM.IN) return INPUT;
        if (op == VM.CONST) return CONSTANT;
        if (op <= VM.DIV) return ARITHMETIC;
        if (op <= VM.EQ) return COMPARE;
        if (op <= VM.OR) return LOGIC;
        return SELECT;
    }

    function _glyph(Buf memory out, uint256 op, uint256 px, uint256 py, uint256 s) private pure {
        uint256 family = _family(op);
        if (family == CONSTANT) {
            uint256 h = (3 * s) / 4;
            _put(out, '<rect class="c" x="');
            _num(out, px - h);
            _put(out, '" y="');
            _num(out, py - h);
            _put(out, '" width="');
            _num(out, 2 * h);
            _put(out, '" height="');
            _num(out, 2 * h);
            _put(out, '"/>\n');
        } else if (family == COMPARE) {
            // diamond: top, right, bottom, left
            _put(out, '<path class="m" d="M');
            _num(out, px);
            _put(out, " ");
            _num(out, py - s);
            _put(out, "l");
            _num(out, s);
            _put(out, " ");
            _num(out, s);
            _put(out, "-");
            _num(out, s);
            _put(out, " ");
            _num(out, s);
            _put(out, "-");
            _num(out, s);
            _put(out, "-");
            _num(out, s);
            _put(out, 'z"/>\n');
        } else if (family == SELECT) {
            // triangle: apex up, base 2s wide
            _put(out, '<path class="s" d="M');
            _num(out, px);
            _put(out, " ");
            _num(out, py - s);
            _put(out, "l");
            _num(out, s);
            _put(out, " ");
            _num(out, 2 * s);
            _put(out, "h-");
            _num(out, 2 * s);
            _put(out, 'z"/>\n');
        } else {
            // dot (half size), circle and ring (full size) are all circles
            _put(out, '<circle class="');
            _put(out, abi.encodePacked(bytes6("icamls")[family]));
            _put(out, '" cx="');
            _num(out, px);
            _put(out, '" cy="');
            _num(out, py);
            _put(out, '" r="');
            _num(out, family == INPUT ? (s + 1) / 2 : s);
            _put(out, '"/>\n');
        }
    }

    function _halos(Buf memory out, bytes memory program, Layout memory l) private pure {
        _put(out, '<g id="halos">\n');
        uint256 outputsAt = 4 + 4 * l.n;
        uint256 outCount = uint8(program[3]);

        uint256 isOutput; // bit i set when node i is an output
        for (uint256 s; s < outCount; ++s) {
            isOutput |= uint256(1) << uint8(program[outputsAt + s]);
        }
        for (uint256 i; i < l.n; ++i) {
            if (isOutput & (uint256(1) << i) == 0) continue;
            uint256 r = _size(l.value[i]) + 4;
            _put(out, '<circle class="h" cx="');
            _num(out, l.x[i]);
            _put(out, '" cy="');
            _num(out, l.y[i]);
            _put(out, '" r="');
            _num(out, r);
            _put(out, '"><animate attributeName="r" values="');
            _num(out, r);
            _put(out, ";");
            _num(out, r + 4);
            _put(out, ";");
            _num(out, r);
            _put(out, '" dur="2.4s" repeatCount="indefinite"/></circle>\n');
        }
        _put(out, "</g>\n");
    }

    // ------------------------------------------------------------------ buffer

    /// @dev Appends `s`. Building the SVG by repeated `string.concat` would allocate a new copy each
    ///      time; the total memory touched grows quadratically and memory expansion gas with it.
    function _put(Buf memory out, bytes memory s) private pure {
        uint256 len = out.len;
        uint256 n = s.length;
        if (len + n > BUF_CAP) revert BufferOverflow();
        bytes memory data = out.data;
        assembly ("memory-safe") {
            mcopy(add(add(data, 0x20), len), add(s, 0x20), n)
        }
        out.len = len + n;
    }

    function _num(Buf memory out, uint256 v) private pure {
        _put(out, bytes(LibString.toString(v)));
    }
}
