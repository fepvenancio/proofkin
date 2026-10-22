// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VM} from "../src/VM.sol";
import {Puzzles} from "../src/Puzzles.sol";

/// @notice §4.2: every puzzle has a hand-written solution under 64 nodes that solves all 10 trials
///         on 1,000 seeds. The programs are fixtures/solutions/*.pk, assembled into
///         fixtures/solutions.json by `pnpm gen:fixtures`.
contract SolutionsTest is Test {
    uint256 constant SEEDS = 1000;

    function _program(string memory name) private view returns (bytes memory) {
        return vm.parseJsonBytes(vm.readFile("fixtures/solutions.json"), string.concat(".", name));
    }

    /// @dev First (seed, trial) the program gets wrong, if any. Each trial rewinds the free memory
    ///      pointer: Solidity never frees, and 10,000 trials of dead arrays would otherwise make
    ///      memory expansion cost more gas than a test may use. Nothing allocated inside a trial
    ///      is referenced after it.
    function _firstFailure(uint256 id, bytes memory program)
        private
        pure
        returns (bool failed, uint256 seed, uint256 trial)
    {
        uint256 mark;
        assembly ("memory-safe") {
            mark := mload(0x40)
        }
        for (seed; seed < SEEDS; ++seed) {
            for (trial = 0; trial < Puzzles.TRIALS; ++trial) {
                uint256[] memory x = Puzzles.inputs(id, bytes32(seed), trial);
                (bool ok, uint256[] memory outputs,) = VM.run(program, x);
                bool wrong = !ok
                    || keccak256(abi.encode(outputs))
                        != keccak256(abi.encode(Puzzles.referenceOutputs(id, x)));
                assembly ("memory-safe") {
                    mstore(0x40, mark)
                }
                if (wrong) return (true, seed, trial);
            }
        }
    }

    function _assertSolves(uint256 id, string memory name) private view {
        bytes memory program = _program(name);
        VM.validate(program);
        assertEq(uint8(program[1]), id, "puzzle id");
        assertLt(uint8(program[2]), 64, "node count");

        (bool failed, uint256 seed, uint256 trial) = _firstFailure(id, program);
        assertFalse(
            failed,
            string.concat(
                name, " fails at seed ", vm.toString(seed), ", trial ", vm.toString(trial)
            )
        );
    }

    function test_solution_QUORUM7() public view {
        _assertSolves(0, "QUORUM7");
    }

    function test_solution_MEDIAN5() public view {
        _assertSolves(1, "MEDIAN5");
    }

    function test_solution_SORT8() public view {
        _assertSolves(2, "SORT8");
    }

    function test_solution_GRID_PATH() public view {
        _assertSolves(3, "GRID_PATH");
    }

    function test_solution_KNAPSACK3() public view {
        _assertSolves(4, "KNAPSACK3");
    }

    function test_solution_FAIR_SPLIT4() public view {
        _assertSolves(5, "FAIR_SPLIT4");
    }

    // ------------------------------------------------------------ depths

    function _maxDepth(bytes memory program) private pure returns (uint256 max) {
        uint256[] memory d = VM.depths(program);
        for (uint256 i; i < d.length; ++i) {
            if (d[i] > max) max = d[i];
        }
    }

    /// @dev Longest IN/CONST -> output path, counted by hand from each circuit:
    ///      QUORUM7  6 ADDs in a chain, LT, EQ                     = 8
    ///      MEDIAN5  pair sort, a/b, lo/hi, t, m                   = 5
    ///      SORT8    6 comparator layers                           = 6
    ///      GRID_PATH d11 (2), d12 (4), d22 (6)                     = 6
    ///      KNAPSACK3 subset values at 4, then a chain of 6 MAXes   = 8
    ///      FAIR_SPLIT4 sums (3), LT (4), SEL (5)                   = 5
    function test_depths_ofTheFixtureCircuits() public view {
        assertEq(_maxDepth(_program("QUORUM7")), 8);
        assertEq(_maxDepth(_program("MEDIAN5")), 5);
        assertEq(_maxDepth(_program("SORT8")), 6);
        assertEq(_maxDepth(_program("GRID_PATH")), 6);
        assertEq(_maxDepth(_program("KNAPSACK3")), 8);
        assertEq(_maxDepth(_program("FAIR_SPLIT4")), 5);
    }

    /// @dev The depth of a token is its deepest output; with no dead code that is also the deepest
    ///      node, which is what the renderer's ring layout relies on.
    function test_depths_deepestNodeIsAnOutput() public view {
        string[6] memory names =
            ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"];
        for (uint256 k; k < 6; ++k) {
            bytes memory program = _program(names[k]);
            uint256[] memory d = VM.depths(program);
            uint256 n = uint8(program[2]);
            uint256 maxOut;
            for (uint256 s; s < uint8(program[3]); ++s) {
                uint256 o = d[uint8(program[4 + 4 * n + s])];
                if (o > maxOut) maxOut = o;
            }
            assertEq(maxOut, _maxDepth(program), names[k]);
        }
    }

    // ------------------------------------------------- the check can fail

    /// @dev Offset of the first node with opcode `op`.
    function _firstNode(bytes memory program, uint8 op) private pure returns (uint256) {
        for (uint256 i; i < uint8(program[2]); ++i) {
            if (uint8(program[4 + 4 * i]) == op) return 4 + 4 * i;
        }
        revert("opcode not found");
    }

    function test_brokenSort8_isCaught() public view {
        bytes memory program = _program("SORT8");
        program[_firstNode(program, uint8(VM.MIN))] = bytes1(uint8(VM.MAX)); // first comparator only
        VM.validate(program); // still structurally fine
        (bool failed,,) = _firstFailure(2, program);
        assertTrue(failed);
    }

    function test_brokenQuorum7_isCaught() public view {
        bytes memory program = _program("QUORUM7");
        uint256 lt = _firstNode(program, uint8(VM.LT)); // sum < t  ->  t < sum
        (program[lt + 1], program[lt + 2]) = (program[lt + 2], program[lt + 1]);
        VM.validate(program);
        (bool failed,,) = _firstFailure(0, program);
        assertTrue(failed);
    }
}
