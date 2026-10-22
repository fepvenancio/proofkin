// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LibString} from "solady/utils/LibString.sol";
import {Renderer} from "../src/Renderer.sol";
import {MockProofkin} from "./helpers/MockProofkin.sol";
import {Prog} from "./helpers/Prog.sol";

/// @notice PLAN.md §6 budgets: an SVG under 40 KB, and `tokenURI` under 25M gas, for any valid
///         program, plus a sweep that renders every program in the differential fixture.
contract RendererLimitsTest is Test {
    uint256 constant SVG_LIMIT = 40_000;
    uint256 constant GAS_LIMIT = 25_000_000;

    bytes32 constant SEED = 0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8ff9;

    Renderer r = new Renderer();
    MockProofkin proofkin = new MockProofkin(r);

    // ------------------------------------------------------------ worst cases

    /// @dev 64 nodes: three CONSTs, then 61 SELs each reading the three nodes before it. That is the
    ///      most edges a program can have (3 per SEL = 183), one layer per node after the first
    ///      three (62 rings), a triangle (the longest glyph path) for almost every node, and, with
    ///      the last eight nodes as SORT8's outputs, the most halos (8).
    function _selChain(uint8 puzzle, bytes memory outs) private pure returns (bytes memory) {
        bytes memory nodes = bytes.concat(Prog.konst(65_535), Prog.konst(1), Prog.konst(2));
        for (uint256 i = 3; i < 64; ++i) {
            nodes =
                bytes.concat(nodes, Prog.node(Prog.SEL, uint8(i - 1), uint8(i - 2), uint8(i - 3)));
        }
        return Prog.build(puzzle, nodes, outs);
    }

    function _lastEight() private pure returns (bytes memory outs) {
        outs = new bytes(8);
        for (uint256 i; i < 8; ++i) {
            outs[i] = bytes1(uint8(56 + i));
        }
    }

    function _worstCase() private pure returns (bytes memory) {
        return _selChain(Prog.SORT8, _lastEight());
    }

    function _count(string memory subject, string memory needle) private pure returns (uint256 n) {
        uint256 pos = LibString.indexOf(subject, needle);
        while (pos != LibString.NOT_FOUND) {
            ++n;
            pos = LibString.indexOf(subject, needle, pos + bytes(needle).length);
        }
    }

    function test_theWorstCaseProgramHasTheShapeItIsMeantTo() public view {
        string memory svg = r.render(_worstCase(), SEED);
        assertEq(_count(svg, '<path d="M'), 183, "3 edges for each of 61 SELs");
        assertEq(_count(svg, 'class="o"'), 62, "one ring per layer: depths 0..61");
        assertEq(_count(svg, 'class="s"'), 61, "a triangle per SEL");
        assertEq(_count(svg, 'class="h"'), 8, "eight halos");
    }

    function test_worstCaseSvgStaysUnder40KB() public {
        uint256 size = bytes(r.render(_worstCase(), SEED)).length;
        emit log_named_uint("worst-case SVG bytes", size);
        assertLt(size, SVG_LIMIT);
    }

    function test_otherLargeShapesStayUnder40KB() public {
        // a 64-layer chain of single-operand-ish ADDs
        uint256 chain =
            bytes(r.render(Prog.build(Prog.QUORUM7, Prog.addChain(64), Prog.out(63)), SEED)).length;
        // the same SEL chain with one output
        uint256 oneOut = bytes(r.render(_selChain(Prog.QUORUM7, Prog.out(63)), SEED)).length;
        emit log_named_uint("ADD chain SVG bytes", chain);
        emit log_named_uint("SEL chain, one output, SVG bytes", oneOut);
        assertLt(chain, SVG_LIMIT);
        assertLt(oneOut, SVG_LIMIT);
    }

    function test_worstCaseTokenURIGasIsUnder25M() public {
        bytes memory program = _worstCase();
        proofkin.mint(1, program, SEED, 61, 50, true);
        proofkin.setBest(2, 64); // optimal: adds the gold ring too

        uint256 before = gasleft();
        string memory uri = proofkin.tokenURI(1);
        uint256 used = before - gasleft();

        emit log_named_uint("worst-case tokenURI gas", used);
        emit log_named_uint("worst-case tokenURI bytes", bytes(uri).length);
        assertLt(used, GAS_LIMIT);
    }

    function test_worstCaseRenderGasIsUnder25M() public {
        uint256 before = gasleft();
        r.render(_worstCase(), SEED);
        uint256 renderGas = before - gasleft();
        emit log_named_uint("worst-case render gas", renderGas);
        assertLt(renderGas, GAS_LIMIT);
    }

    // ------------------------------------------------------------------ sweep

    struct ValidRow {
        uint256[] inputs;
        bool ok;
        uint256[] outputs;
        uint256[] program;
        uint256 puzzleId;
        uint256[] values;
    }

    uint256 constant CHUNK = 500; // rows; each program appears in two consecutive rows

    function _bytes(uint256[] memory xs) private pure returns (bytes memory b) {
        b = new bytes(xs.length);
        for (uint256 i; i < xs.length; ++i) {
            b[i] = bytes1(uint8(xs[i]));
        }
    }

    /// @dev Renders every other row (each program is in two) of one slice of fixtures/diff.json.
    ///      Free memory is rewound per program: Solidity never frees, and the renders' buffers
    ///      would otherwise add up to more memory than a test may pay for.
    function _sweep(uint256 n) private {
        string memory path = string.concat(
            ".valid[", vm.toString(n * CHUNK), ":", vm.toString((n + 1) * CHUNK), "]"
        );
        ValidRow[] memory rows =
            abi.decode(vm.parseJson(vm.readFile("fixtures/diff.json"), path), (ValidRow[]));
        assertEq(rows.length, CHUNK);

        uint256 mark;
        assembly ("memory-safe") {
            mark := mload(0x40)
        }
        uint256 longest;
        for (uint256 i; i < rows.length; i += 2) {
            bytes memory program = _bytes(rows[i].program);
            bytes32 seed = keccak256(abi.encode(n, i));
            string memory svg = r.render(program, seed);

            uint256 size = bytes(svg).length;
            if (size >= SVG_LIMIT) {
                revert(
                    string.concat(
                        "SVG too large (",
                        vm.toString(size),
                        " bytes), row ",
                        vm.toString(n * CHUNK + i)
                    )
                );
            }
            if (!LibString.startsWith(svg, "<svg ") || !LibString.endsWith(svg, "</svg>")) {
                revert(string.concat("malformed SVG, row ", vm.toString(n * CHUNK + i)));
            }
            if (size > longest) longest = size;
            assembly ("memory-safe") {
                mstore(0x40, mark)
            }
        }
        emit log_named_uint("largest SVG in this slice", longest);
    }

    function test_sweep_0() public {
        _sweep(0);
    }

    function test_sweep_1() public {
        _sweep(1);
    }

    function test_sweep_2() public {
        _sweep(2);
    }

    function test_sweep_3() public {
        _sweep(3);
    }

    function test_sweep_4() public {
        _sweep(4);
    }

    function test_sweep_5() public {
        _sweep(5);
    }

    function test_sweep_6() public {
        _sweep(6);
    }

    function test_sweep_7() public {
        _sweep(7);
    }
}
