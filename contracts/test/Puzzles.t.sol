// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Puzzles} from "../src/Puzzles.sol";

/// @dev External wrapper so `vm.expectRevert` can observe the library's reverts.
contract PuzzlesHarness {
    function inputCount(uint256 id) external pure returns (uint256) {
        return Puzzles.inputCount(id);
    }

    function outputCount(uint256 id) external pure returns (uint256) {
        return Puzzles.outputCount(id);
    }

    function inputs(uint256 id, bytes32 seed, uint256 trial)
        external
        pure
        returns (uint256[] memory)
    {
        return Puzzles.inputs(id, seed, trial);
    }

    function referenceOutputs(uint256 id, uint256[] memory x)
        external
        pure
        returns (uint256[] memory)
    {
        return Puzzles.referenceOutputs(id, x);
    }
}

contract PuzzlesTest is Test {
    PuzzlesHarness h = new PuzzlesHarness();

    uint256 constant QUORUM7 = 0;
    uint256 constant MEDIAN5 = 1;
    uint256 constant SORT8 = 2;
    uint256 constant GRID_PATH = 3;
    uint256 constant KNAPSACK3 = 4;
    uint256 constant FAIR_SPLIT4 = 5;

    bytes32 constant SEED_1 = bytes32(uint256(1));
    bytes32 constant SEED_2 = bytes32(uint256(0xdeadbeef));

    function _u(uint256[] memory a) private pure returns (bytes memory) {
        return abi.encode(a);
    }

    function _list(uint256 a) private pure returns (uint256[] memory x) {
        x = new uint256[](1);
        x[0] = a;
    }

    function _fill(uint256 n, uint256 v) private pure returns (uint256[] memory x) {
        x = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            x[i] = v;
        }
    }

    function _arr(uint256[] memory x) private pure returns (uint256[] memory) {
        return x;
    }

    /// @dev Inclusive [lo, hi] for input `i`, written out from the §4 table.
    function _range(uint256 id, uint256 i) private pure returns (uint256 lo, uint256 hi) {
        if (id == QUORUM7) return i < 7 ? (0, 1) : (1, 7);
        if (id == MEDIAN5 || id == SORT8) return (0, 255);
        if (id == GRID_PATH) return (0, 15);
        if (id == KNAPSACK3) return i == 6 ? (1, 40) : (i % 2 == 0 ? (1, 20) : (0, 50));
        return i == 0 ? (1, 4000) : (1, 1000);
    }

    // ---------------------------------------------------------------- shapes

    function test_shapes() public view {
        uint8[6] memory nIn = [8, 5, 8, 12, 7, 5];
        uint8[6] memory nOut = [1, 1, 8, 1, 1, 4];
        for (uint256 id; id < 6; ++id) {
            assertEq(h.inputCount(id), nIn[id], "inputCount");
            assertEq(h.outputCount(id), nOut[id], "outputCount");
        }
    }

    function test_unknownPuzzleReverts() public {
        bytes memory err = abi.encodeWithSelector(Puzzles.UnknownPuzzle.selector, 6);
        vm.expectRevert(err);
        h.inputCount(6);
        vm.expectRevert(err);
        h.outputCount(6);
        vm.expectRevert(err);
        h.inputs(6, SEED_1, 0);
        vm.expectRevert(err);
        h.referenceOutputs(6, new uint256[](0));
    }

    function test_referenceRejectsWrongInputLength() public {
        vm.expectRevert(Puzzles.BadInputLength.selector);
        h.referenceOutputs(SORT8, new uint256[](7));
        vm.expectRevert(Puzzles.BadInputLength.selector);
        h.referenceOutputs(SORT8, new uint256[](9));
    }

    // ------------------------------------------------- fixed trials 0 and 1

    function _expectFixed(uint256 id, uint256 trial, uint256[] memory xs, uint256[] memory want)
        private
        view
    {
        assertEq(_u(h.inputs(id, SEED_1, trial)), _u(xs), "inputs, seed 1");
        assertEq(_u(h.inputs(id, SEED_2, trial)), _u(xs), "inputs, seed 2");
        assertEq(_u(h.referenceOutputs(id, xs)), _u(want), "reference");
    }

    function test_fixedTrials_quorum7() public view {
        _expectFixed(QUORUM7, 0, _arr(_seq7(0, 7)), _list(0));
        _expectFixed(QUORUM7, 1, _arr(_seq7(1, 1)), _list(1));
    }

    function _seq7(uint256 vote, uint256 t) private pure returns (uint256[] memory x) {
        x = _fill(8, vote);
        x[7] = t;
    }

    function test_fixedTrials_median5() public view {
        _expectFixed(MEDIAN5, 0, _fill(5, 128), _list(128));
        uint256[] memory desc = new uint256[](5);
        for (uint256 i; i < 5; ++i) {
            desc[i] = 200 - 50 * i;
        }
        _expectFixed(MEDIAN5, 1, desc, _list(100));
    }

    function test_fixedTrials_sort8() public view {
        _expectFixed(SORT8, 0, _fill(8, 128), _fill(8, 128));
        uint256[] memory desc = new uint256[](8);
        uint256[] memory asc = new uint256[](8);
        for (uint256 i; i < 8; ++i) {
            desc[i] = 224 - 32 * i;
            asc[i] = 32 * i;
        }
        _expectFixed(SORT8, 1, desc, asc);
    }

    function test_fixedTrials_gridPath() public view {
        _expectFixed(GRID_PATH, 0, _fill(12, 0), _list(0));
        _expectFixed(GRID_PATH, 1, _fill(12, 15), _list(60));
    }

    function test_fixedTrials_knapsack3() public view {
        uint256[] memory heavy = new uint256[](7); // every weight > cap
        heavy[0] = 6;
        heavy[1] = 50;
        heavy[2] = 10;
        heavy[3] = 40;
        heavy[4] = 20;
        heavy[5] = 30;
        heavy[6] = 5;
        _expectFixed(KNAPSACK3, 0, heavy, _list(0));

        uint256[] memory light = new uint256[](7); // every weight 1, cap 40
        light[0] = 1;
        light[1] = 10;
        light[2] = 1;
        light[3] = 20;
        light[4] = 1;
        light[5] = 30;
        light[6] = 40;
        _expectFixed(KNAPSACK3, 1, light, _list(60));
    }

    function test_fixedTrials_fairSplit4() public view {
        uint256[] memory exact = new uint256[](5); // sum == B
        exact[0] = 1000;
        exact[1] = 100;
        exact[2] = 200;
        exact[3] = 300;
        exact[4] = 400;
        uint256[] memory same = new uint256[](4);
        same[0] = 100;
        same[1] = 200;
        same[2] = 300;
        same[3] = 400;
        _expectFixed(FAIR_SPLIT4, 0, exact, same);

        uint256[] memory over = _fill(5, 1000); // sum > B, all r = 1000
        over[0] = 3999;
        _expectFixed(FAIR_SPLIT4, 1, over, _fill(4, 999));
    }

    // ----------------------------------------------------- random trials

    /// @dev Known answers computed independently with `cast keccak` + python bigints.
    function test_randomTrials_knownAnswers() public view {
        uint256[] memory want = new uint256[](8);
        want[1] = 1;
        want[7] = 4;
        assertEq(_u(h.inputs(QUORUM7, SEED_1, 2)), _u(want));

        want = _knownKnapsack();
        assertEq(_u(h.inputs(KNAPSACK3, SEED_1, 2)), _u(want));

        want = new uint256[](5);
        (want[0], want[1], want[2], want[3], want[4]) = (2105, 935, 328, 961, 721);
        assertEq(_u(h.inputs(FAIR_SPLIT4, SEED_2, 9)), _u(want));

        want = new uint256[](8);
        (want[0], want[1], want[2], want[3]) = (211, 92, 198, 65);
        (want[4], want[5], want[6], want[7]) = (160, 154, 18, 229);
        assertEq(_u(h.inputs(SORT8, SEED_2, 5)), _u(want));
    }

    function _knownKnapsack() private pure returns (uint256[] memory x) {
        x = new uint256[](7);
        (x[0], x[1], x[2], x[3]) = (13, 42, 19, 21);
        (x[4], x[5], x[6]) = (15, 33, 21);
    }

    function test_randomTrials_dependOnSeedAndTrial() public view {
        bytes memory base = _u(h.inputs(SORT8, SEED_1, 3));
        assertEq(base, _u(h.inputs(SORT8, SEED_1, 3)));
        assertTrue(keccak256(base) != keccak256(_u(h.inputs(SORT8, SEED_1, 4))));
        assertTrue(keccak256(base) != keccak256(_u(h.inputs(SORT8, SEED_2, 3))));
    }

    function testFuzz_inputsStayInRange(uint8 idSeed, bytes32 seed, uint8 trial) public view {
        uint256 id = bound(idSeed, 0, 5);
        uint256[] memory xs = h.inputs(id, seed, trial);
        assertEq(xs.length, h.inputCount(id));
        for (uint256 i; i < xs.length; ++i) {
            (uint256 lo, uint256 hi) = _range(id, i);
            assertGe(xs[i], lo);
            assertLe(xs[i], hi);
        }
    }

    // --------------------------------------------- reference solvers

    function test_reference_quorum7() public view {
        uint256[] memory x = new uint256[](8); // votes 1,1,0,1,0,0,1 -> sum 4
        (x[0], x[1], x[3], x[6]) = (1, 1, 1, 1);
        x[7] = 4;
        assertEq(h.referenceOutputs(QUORUM7, x)[0], 1);
        x[7] = 5;
        assertEq(h.referenceOutputs(QUORUM7, x)[0], 0);
    }

    function test_reference_median5() public view {
        uint256[] memory x = new uint256[](5);
        (x[0], x[1], x[2], x[3], x[4]) = (9, 1, 5, 7, 3);
        assertEq(h.referenceOutputs(MEDIAN5, x)[0], 5);
        (x[0], x[1], x[2], x[3], x[4]) = (4, 4, 1, 9, 9);
        assertEq(h.referenceOutputs(MEDIAN5, x)[0], 4);
    }

    function test_reference_sort8() public view {
        uint256[] memory x = new uint256[](8);
        (x[0], x[1], x[2], x[3]) = (5, 3, 8, 1);
        (x[4], x[5], x[6], x[7]) = (9, 2, 7, 4);
        uint256[] memory want = new uint256[](8);
        (want[0], want[1], want[2], want[3]) = (1, 2, 3, 4);
        (want[4], want[5], want[6], want[7]) = (5, 7, 8, 9);
        assertEq(_u(h.referenceOutputs(SORT8, x)), _u(want));
    }

    function _grid(uint256 cost) private pure returns (uint256[] memory) {
        return _fill(12, cost);
    }

    function test_reference_gridPath_edgeOrder() public view {
        // right, right, down, down: inputs 0, 1 (row-0 horizontals), 8 (0,2)->(1,2), 11 (1,2)->(2,2)
        uint256[] memory g = _grid(15);
        (g[0], g[1], g[8], g[11]) = (1, 1, 1, 1);
        assertEq(h.referenceOutputs(GRID_PATH, g)[0], 4);

        // down, down, right, right: inputs 6 (0,0)->(1,0), 9 (1,0)->(2,0), 4 and 5 (row-2 horizontals)
        g = _grid(15);
        (g[6], g[9], g[4], g[5]) = (2, 2, 2, 2);
        assertEq(h.referenceOutputs(GRID_PATH, g)[0], 8);

        // right, down, right, down: inputs 0, 7 (0,1)->(1,1), 3 (1,1)->(1,2), 11
        g = _grid(15);
        (g[0], g[7], g[3], g[11]) = (3, 3, 3, 3);
        assertEq(h.referenceOutputs(GRID_PATH, g)[0], 12);
    }

    function test_reference_knapsack3() public view {
        uint256[] memory x = new uint256[](7); // items (w,v) = (3,4) (4,5) (5,6)
        (x[0], x[1], x[2], x[3], x[4], x[5]) = (3, 4, 4, 5, 5, 6);
        x[6] = 9;
        assertEq(h.referenceOutputs(KNAPSACK3, x)[0], 11);
        x[6] = 2;
        assertEq(h.referenceOutputs(KNAPSACK3, x)[0], 0);
        x[6] = 12;
        assertEq(h.referenceOutputs(KNAPSACK3, x)[0], 15);
    }

    function test_reference_fairSplit4() public view {
        uint256[] memory x = new uint256[](5);
        (x[0], x[1], x[2], x[3], x[4]) = (10, 1, 2, 3, 4); // sum 10 <= B: full grant
        uint256[] memory want = new uint256[](4);
        (want[0], want[1], want[2], want[3]) = (1, 2, 3, 4);
        assertEq(_u(h.referenceOutputs(FAIR_SPLIT4, x)), _u(want));

        x[0] = 5; // proportional, floored
        (want[0], want[1], want[2], want[3]) = (0, 1, 1, 2);
        assertEq(_u(h.referenceOutputs(FAIR_SPLIT4, x)), _u(want));
    }
}
