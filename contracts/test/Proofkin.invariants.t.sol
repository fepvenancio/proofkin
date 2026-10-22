// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {IProofkin} from "../src/IProofkin.sol";
import {Proofkin} from "../src/Proofkin.sol";
import {Puzzles} from "../src/Puzzles.sol";
import {VM} from "../src/VM.sol";
import {ProofkinBase} from "./helpers/ProofkinBase.sol";
import {ProofkinHandler} from "./helpers/ProofkinHandler.sol";
import {Variants} from "./helpers/Variants.sol";

/// @notice PLAN.md §7. The handler hammers commit/reveal; these invariants must survive any sequence.
///         The cheap ones run after every call. The ones that walk every token run once per run, in
///         `afterInvariant`.
contract ProofkinInvariantTest is ProofkinBase {
    uint256 constant PRICE = MINT_PRICE;
    uint256 constant SUPPLY_CAP = 300;

    ProofkinHandler internal handler;

    function setUp() public {
        _deploy(PRICE);

        string[6] memory names =
            ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"];
        bytes[] memory bases = new bytes[](6);
        for (uint256 p; p < 6; ++p) {
            bases[p] = _solution(names[p]);
        }
        address[] memory actors = new address[](3);
        (actors[0], actors[1], actors[2]) = (alice, bob, makeAddr("carol"));

        handler = new ProofkinHandler(proofkin, bases, actors);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = ProofkinHandler.attempt.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // ----------------------------------------------- checked after every call

    function invariant_supplyAndSlotsAreCapped() public view {
        uint256 total;
        for (uint256 p; p < 6; ++p) {
            uint256 solved = proofkin.solvedCount(p);
            assertLe(solved, SLOTS, "a puzzle holds at most 50");
            total += solved;
        }
        assertEq(total, proofkin.totalSupply(), "slots add up to the supply");
        assertLe(proofkin.totalSupply(), SUPPLY_CAP, "at most 300 tokens");
    }

    function invariant_everyRevertWasAnExpectedOne() public view {
        assertFalse(
            handler.unexpectedRevert(), "a valid solution was refused for an unexpected reason"
        );
    }

    function invariant_theHandlerAndTheContractAgreeOnWhatWasMinted() public view {
        assertEq(handler.mints(), proofkin.totalSupply());
    }

    function invariant_theContractHoldsExactlyTheFeesPaid() public view {
        assertEq(address(proofkin).balance, PRICE * proofkin.totalSupply());
    }

    // ------------------------------------------------- checked once per run

    /// @dev Every token: its program is unique and valid, it solves all 10 trials on the stored seed,
    ///      and the bookkeeping around it (rank, best size, records) is consistent per puzzle.
    function afterInvariant() external view {
        uint256 supply = proofkin.totalSupply();
        bytes32[] memory hashes = new bytes32[](supply);

        uint256[6] memory runningBest = [uint256(255), 255, 255, 255, 255, 255];
        uint256[6] memory count;

        for (uint256 id = 1; id <= supply; ++id) {
            IProofkin.Token memory t = _token(id);
            bytes memory program = SSTORE2.read(t.program);

            hashes[id - 1] = keccak256(program);
            assertTrue(proofkin.seen(hashes[id - 1]), "a minted program is marked seen");
            VM.validate(program);
            assertEq(uint8(program[1]), t.puzzleId);
            assertEq(uint8(program[2]), t.nodeCount);

            _assertSolvesOnItsSeed(program, t);

            // bookkeeping, per puzzle, in mint order
            ++count[t.puzzleId];
            assertEq(t.rank, count[t.puzzleId], "rank is the solve order within the puzzle");
            assertEq(
                t.recordAtMint,
                t.nodeCount < runningBest[t.puzzleId],
                "records need strictly fewer nodes"
            );
            if (t.nodeCount < runningBest[t.puzzleId]) runningBest[t.puzzleId] = t.nodeCount;
        }

        for (uint256 i; i < supply; ++i) {
            for (uint256 j = i + 1; j < supply; ++j) {
                assertTrue(hashes[i] != hashes[j], "no two tokens share a program");
            }
        }
        for (uint256 p; p < 6; ++p) {
            assertEq(
                proofkin.bestNodes(p), runningBest[p], "bestNodes is the minimum over the tokens"
            );
            assertEq(proofkin.solvedCount(p), count[p]);
        }
    }

    function _assertSolvesOnItsSeed(bytes memory program, IProofkin.Token memory t) private pure {
        for (uint256 trial; trial < Puzzles.TRIALS; ++trial) {
            uint256[] memory x = Puzzles.inputs(t.puzzleId, t.seed, trial);
            (bool ok, uint256[] memory got,) = VM.run(program, x);
            assertTrue(ok, "no arithmetic failure on the stored seed");
            assertEq(
                abi.encode(got),
                abi.encode(Puzzles.referenceOutputs(t.puzzleId, x)),
                "outputs on the stored seed"
            );
        }
    }

    // ------------------------------------------------ the cap, reached for real

    /// @dev Fill every slot of every puzzle (6 x 50 = 300), then show a 301st solution of each is refused.
    function test_theCollectionTopsOutAtThreeHundred() public {
        string[6] memory names =
            ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"];
        uint256 id;
        for (uint256 p; p < 6; ++p) {
            bytes memory base = _solution(names[p]);
            assertGe(Variants.swappable(base), 6, "enough distinct variants to fill 50 slots");
            for (uint256 m; m < SLOTS; ++m) {
                id = _mintAs(alice, Variants.swap(base, m));
            }
        }
        assertEq(id, SUPPLY_CAP);
        assertEq(proofkin.totalSupply(), SUPPLY_CAP);

        for (uint256 p; p < 6; ++p) {
            assertEq(proofkin.solvedCount(p), SLOTS);
            bytes memory extra = Variants.swap(_solution(names[p]), SLOTS);
            (bytes32 salt,) = _commit(alice, extra);
            vm.roll(block.number + 3);
            _revealReverts(alice, extra, salt, abi.encodeWithSelector(Proofkin.PuzzleFull.selector));
        }
        assertEq(proofkin.totalSupply(), SUPPLY_CAP, "still 300");
    }
}
