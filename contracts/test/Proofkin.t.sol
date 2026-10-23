// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {IProofkin} from "../src/IProofkin.sol";
import {Proofkin} from "../src/Proofkin.sol";
import {Puzzles} from "../src/Puzzles.sol";
import {VM} from "../src/VM.sol";
import {ProofkinBase} from "./helpers/ProofkinBase.sol";
import {Prog} from "./helpers/Prog.sol";
import {Variants} from "./helpers/Variants.sol";

/// @dev A smart-contract wallet with no `onERC721Received`: `_mint` must not need one.
contract ContractMinter {
    Proofkin private immutable proofkin;

    constructor(Proofkin proofkin_) {
        proofkin = proofkin_;
    }

    function commit(bytes32 h) external {
        proofkin.commit(h);
    }

    function reveal(bytes calldata program, bytes32 salt) external payable {
        proofkin.reveal{value: msg.value}(program, salt);
    }
}

/// @notice PLAN.md §5.1 commit-reveal, §5.2 token data.
contract ProofkinTest is ProofkinBase {
    // expected size and depth of each fixture circuit (depths worked out by hand in Solutions.t.sol)
    string[6] internal names =
        ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"];
    uint8[6] internal nodeCounts = [17, 15, 46, 26, 36, 21];
    uint8[6] internal depths = [8, 5, 6, 6, 8, 5];

    function setUp() public {
        _deploy(MINT_PRICE);
    }

    // ------------------------------------------------------------------ helpers

    function _err(bytes4 selector) private pure returns (bytes memory) {
        return abi.encodeWithSelector(selector);
    }

    /// @dev The seed `reveal` will derive for a commit made at `commitBlock`.
    function _seedFor(uint256 commitBlock, bytes32 h) private view returns (bytes32) {
        return keccak256(abi.encode(blockhash(commitBlock + REVEAL_DELAY), h));
    }

    /// @dev First trial the program gets wrong on `seed`, or the puzzle's `trialCount` if it solves them all.
    function _firstFailingTrial(bytes memory program, bytes32 seed)
        private
        pure
        returns (uint256 trial)
    {
        uint256 puzzleId = uint8(program[1]);
        uint256 count = Puzzles.trialCount(puzzleId);
        for (; trial < count; ++trial) {
            uint256[] memory x = Puzzles.inputs(puzzleId, seed, trial);
            (bool ok, uint256[] memory out,) = VM.run(program, x);
            if (
                !ok
                    || keccak256(abi.encode(out))
                        != keccak256(abi.encode(Puzzles.referenceOutputs(puzzleId, x)))
            ) {
                return trial;
            }
        }
    }

    function _firstNode(bytes memory program, uint8 op) private pure returns (uint256) {
        for (uint256 i; i < uint8(program[2]); ++i) {
            if (uint8(program[4 + 4 * i]) == op) return 4 + 4 * i;
        }
        revert("opcode not found");
    }

    // ------------------------------------------------------------ initial state

    function test_initialState() public view {
        assertEq(proofkin.owner(), owner);
        assertEq(proofkin.renderer(), address(renderer));
        assertFalse(proofkin.rendererLocked());
        assertEq(proofkin.mintPrice(), MINT_PRICE);
        assertEq(proofkin.totalSupply(), 0);
        assertEq(proofkin.name(), "Proofkin");
        assertEq(proofkin.symbol(), "PKIN");
        for (uint256 p; p < 6; ++p) {
            assertEq(proofkin.bestNodes(p), 255, "bestNodes starts at 255");
            assertEq(proofkin.solvedCount(p), 0);
        }
    }

    // ------------------------------------------------------------------ commit

    function test_commitRecordsTheBlock() public {
        bytes32 h = keccak256("a commitment");
        vm.roll(77);
        vm.prank(alice);
        proofkin.commit(h);
        assertEq(proofkin.commitBlock(h), 77);
        assertEq(proofkin.commitBlock(keccak256("something else")), 0);
    }

    function test_aCommitCannotBeMadeTwice() public {
        bytes32 h = keccak256("a commitment");
        vm.prank(alice);
        proofkin.commit(h);

        vm.expectRevert(Proofkin.AlreadyCommitted.selector);
        vm.prank(alice);
        proofkin.commit(h);

        vm.expectRevert(Proofkin.AlreadyCommitted.selector);
        vm.prank(bob);
        proofkin.commit(h);
    }

    // ------------------------------------------------- reveal needs its own commit

    function test_revealWithoutACommitReverts() public {
        _revealReverts(alice, _solution("SORT8"), bytes32(0), _err(Proofkin.NoCommit.selector));
    }

    function test_aCommitIsBoundToProgramSenderAndSalt() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);

        bytes memory noCommit = _err(Proofkin.NoCommit.selector);
        _revealReverts(bob, p, salt, noCommit); // someone else cannot reveal alice's commit
        _revealReverts(alice, p, bytes32(uint256(salt) + 1), noCommit); // wrong salt
        _revealReverts(alice, Variants.swap(p, 1), salt, noCommit); // a different program

        _reveal(alice, p, salt); // while the right sender, salt and program still work
        assertEq(proofkin.totalSupply(), 1);
    }

    function test_theSameProgramCommittedBySomeoneElseIsADifferentCommit() public {
        bytes memory p = _solution("SORT8");
        (, bytes32 hAlice) = _commit(alice, p);
        (, bytes32 hBob) = _commit(bob, p);
        assertTrue(hAlice != hBob);
    }

    // ------------------------------------------------------------ reveal window

    function test_revealIsTooEarlyUntilTheThirdBlockAfterTheCommit() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt,) = _commit(alice, p);
        uint256 cb = block.number;

        bytes memory tooEarly = _err(Proofkin.TooEarly.selector);
        _revealReverts(alice, p, salt, tooEarly); // same block
        vm.roll(cb + 1);
        _revealReverts(alice, p, salt, tooEarly);
        vm.roll(cb + REVEAL_DELAY);
        _revealReverts(alice, p, salt, tooEarly); // block.number == commitBlock + REVEAL_DELAY

        vm.roll(cb + REVEAL_DELAY + 1);
        _reveal(alice, p, salt);
        assertEq(proofkin.totalSupply(), 1);
    }

    function test_revealWorksOnTheLastBlockOfTheWindow() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + REVEAL_WINDOW);
        _reveal(alice, p, salt);
        assertEq(proofkin.totalSupply(), 1);
    }

    function test_revealAfterTheWindowExpiresRevertsAndNeedsANewCommit() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt, bytes32 h) = _commit(alice, p);
        uint256 cb = block.number;

        vm.roll(cb + REVEAL_WINDOW + 1);
        _revealReverts(alice, p, salt, _err(Proofkin.Expired.selector));
        assertEq(proofkin.commitBlock(h), cb, "the stale commit stays, unusable");

        // the same program under a fresh salt is a new commit and goes through
        bytes32 salt2 = bytes32(uint256(0xfeed));
        vm.prank(alice);
        proofkin.commit(_commitHash(p, alice, salt2));
        vm.roll(block.number + 3);
        _reveal(alice, p, salt2);
        assertEq(proofkin.totalSupply(), 1);
    }

    function test_aFailedRevealKeepsItsCommit() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt, bytes32 h) = _commit(alice, p);
        uint256 cb = block.number;

        _revealReverts(alice, p, salt, _err(Proofkin.TooEarly.selector));
        assertEq(proofkin.commitBlock(h), cb, "still committed");

        vm.roll(cb + 3);
        _reveal(alice, p, salt); // the same commit, now in time
        assertEq(proofkin.totalSupply(), 1);
    }

    function test_revealWithAZeroBlockhashReverts() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt,) = _commit(alice, p);
        uint256 cb = block.number;
        vm.roll(cb + 3);

        vm.setBlockhash(cb + REVEAL_DELAY, bytes32(0));
        _revealReverts(alice, p, salt, _err(Proofkin.NoBlockhash.selector));

        vm.setBlockhash(cb + REVEAL_DELAY, keccak256("a real hash"));
        _reveal(alice, p, salt);
        assertEq(proofkin.totalSupply(), 1);
    }

    // ------------------------------------------------------------------- seed

    function test_theSeedIsHashOfTheBlockTwoAfterTheCommitAndTheCommitHash() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt, bytes32 h) = _commit(alice, p);
        uint256 cb = block.number;
        vm.roll(cb + 3);
        _reveal(alice, p, salt);
        assertEq(_token(1).seed, keccak256(abi.encode(blockhash(cb + 2), h)));
    }

    /// Revealing later cannot be used to shop for different inputs: the seed does not depend on when.
    function test_revealingLaterGivesTheSameSeed() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt, bytes32 h) = _commit(alice, p);
        uint256 cb = block.number;
        uint256 snap = vm.snapshotState();

        vm.roll(cb + 3);
        _reveal(alice, p, salt);
        bytes32 early = _token(1).seed;

        vm.revertToState(snap);
        vm.roll(cb + 200);
        _reveal(alice, p, salt);
        bytes32 late = _token(1).seed;

        assertEq(early, late);
        assertEq(early, _seedFor(cb, h));
    }

    // ------------------------------------------------------------------ payment

    function test_revealRequiresExactlyTheMintPrice() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);
        deal(alice, 10 ether);

        uint256[3] memory wrong = [uint256(0), MINT_PRICE - 1, MINT_PRICE + 1];
        for (uint256 i; i < 3; ++i) {
            vm.expectRevert(Proofkin.WrongPayment.selector);
            vm.prank(alice);
            proofkin.reveal{value: wrong[i]}(p, salt);
        }

        vm.prank(alice);
        proofkin.reveal{value: MINT_PRICE}(p, salt);
        assertEq(address(proofkin).balance, MINT_PRICE);
        assertEq(alice.balance, 10 ether - MINT_PRICE);
    }

    /// §5.1 allows a price of zero: then the payment must be exactly nothing.
    function test_aFreeMintRejectsAnyValueAndAcceptsNone() public {
        _deploy(0);
        bytes memory p = _solution("SORT8");
        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);
        deal(alice, 1 ether);

        vm.expectRevert(Proofkin.WrongPayment.selector);
        vm.prank(alice);
        proofkin.reveal{value: 1 wei}(p, salt);

        vm.prank(alice);
        proofkin.reveal(p, salt);
        assertEq(proofkin.totalSupply(), 1);
        assertEq(address(proofkin).balance, 0);
    }

    function test_paymentIsCheckedBeforeTheProgram() public {
        bytes memory dead =
            Prog.build(Prog.QUORUM7, bytes.concat(Prog.konst(1), Prog.konst(2)), Prog.out(0));
        (bytes32 salt,) = _commit(alice, dead);
        vm.roll(block.number + 3);

        vm.expectRevert(Proofkin.WrongPayment.selector);
        vm.prank(alice);
        proofkin.reveal(dead, salt); // no value sent
    }

    // ------------------------------------------------------------- program rules

    function test_validationErrorsComeFromTheVM() public {
        // two nodes, only node 0 is read: node 1 is dead code (rule 7)
        bytes memory dead =
            Prog.build(Prog.QUORUM7, bytes.concat(Prog.konst(1), Prog.konst(2)), Prog.out(0));
        (bytes32 salt,) = _commit(alice, dead);
        vm.roll(block.number + 3);
        _revealReverts(alice, dead, salt, abi.encodeWithSelector(VM.DeadNode.selector, 1));

        bytes memory wrongVersion = _solution("SORT8");
        wrongVersion[0] = 0x02;
        (salt,) = _commit(alice, wrongVersion);
        vm.roll(block.number + 3);
        _revealReverts(alice, wrongVersion, salt, _err(VM.BadVersion.selector));
    }

    function test_aFailedRevealCanBeRetriedOnlyWithANewCommit() public {
        bytes memory dead =
            Prog.build(Prog.QUORUM7, bytes.concat(Prog.konst(1), Prog.konst(2)), Prog.out(0));
        (bytes32 salt,) = _commit(alice, dead);
        vm.roll(block.number + 3);
        _revealReverts(alice, dead, salt, abi.encodeWithSelector(VM.DeadNode.selector, 1));

        // the fixed program (node 1 now used) has a different hash, so the old commit does not cover it
        bytes memory fixedProgram = Prog.build(
            Prog.QUORUM7,
            bytes.concat(Prog.konst(1), Prog.konst(2), Prog.node(Prog.ADD, 0, 1, 0)),
            Prog.out(2)
        );
        _revealReverts(alice, fixedProgram, salt, _err(Proofkin.NoCommit.selector));
    }

    // -------------------------------------------------------------- uniqueness

    function test_aProgramCanOnlyBeMintedOnce() public {
        bytes memory p = _solution("SORT8");
        _mintAs(alice, p);

        (bytes32 salt,) = _commit(bob, p); // bob's commit is a different hash, so it is accepted...
        vm.roll(block.number + 3);
        _revealReverts(bob, p, salt, _err(Proofkin.AlreadyMinted.selector)); // ...but the program is taken
        assertTrue(proofkin.seen(keccak256(p)));
        assertEq(proofkin.totalSupply(), 1);
    }

    /// Uniqueness is of the bytes, not of the behaviour: exchanging the operands of one MIN gives
    /// a new program with identical results. (See docs/M3-notes.md.)
    function test_aBehaviourallyIdenticalVariantIsAnotherProgram() public {
        bytes memory p = _solution("SORT8");
        _mintAs(alice, p);
        _mintAs(bob, Variants.swap(p, 1));
        assertEq(proofkin.totalSupply(), 2);
    }

    // ---------------------------------------------------------------- slots

    function test_aPuzzleHoldsFiftySolutionsAndNoMore() public {
        bytes memory base = _solution("QUORUM7");
        for (uint256 m; m < SLOTS; ++m) {
            _mintAs(alice, Variants.swap(base, m));
        }
        assertEq(proofkin.solvedCount(0), 50);
        assertEq(_token(50).rank, 50);

        bytes memory next = Variants.swap(base, SLOTS);
        (bytes32 salt,) = _commit(alice, next);
        vm.roll(block.number + 3);
        _revealReverts(alice, next, salt, _err(Proofkin.PuzzleFull.selector));

        // other puzzles have slots of their own
        _mintAs(alice, _solution("SORT8"));
        assertEq(proofkin.totalSupply(), 51);
        assertEq(proofkin.solvedCount(2), 1);
    }

    // ------------------------------------------------------------ the solve check

    function test_aProgramThatComputesTheWrongThingIsRejectedAtTheFirstEdgeCase() public {
        bytes memory p = _solution("QUORUM7");
        uint256 lt = _firstNode(p, uint8(Prog.LT)); // sum < t becomes t < sum
        (p[lt + 1], p[lt + 2]) = (p[lt + 2], p[lt + 1]);
        VM.validate(p); // structurally fine

        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);
        _revealReverts(alice, p, salt, abi.encodeWithSelector(Proofkin.SolveFailed.selector, 0));
    }

    function test_aProgramWhoseArithmeticFailsIsRejected() public {
        // IN 0 (a vote, 0 or 1) minus 255 always underflows
        bytes memory nodes = bytes.concat(
            Prog.node(Prog.IN, 0, 0, 0), Prog.konst(255), Prog.node(Prog.SUB, 0, 1, 0)
        );
        bytes memory p = Prog.build(Prog.QUORUM7, nodes, Prog.out(2));
        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);
        _revealReverts(alice, p, salt, abi.encodeWithSelector(Proofkin.SolveFailed.selector, 0));
    }

    /// GRID_PATH with its first MIN turned into MAX gives the same answer when every edge weighs the
    /// same, which is exactly what trials 0 and 1 do, so only a later trial can catch it: here the
    /// first random one (the further fixed trials, 10 and up, would catch it too).
    function test_aProgramThatPassesBothEdgeCasesIsStillCaughtByARandomTrial() public {
        bytes memory p = _solution("GRID_PATH");
        p[_firstNode(p, uint8(Prog.MIN))] = bytes1(Prog.MAX);
        VM.validate(p);

        (bytes32 salt, bytes32 h) = _commit(alice, p);
        uint256 cb = block.number;
        vm.roll(cb + 3);

        uint256 trial = _firstFailingTrial(p, _seedFor(cb, h));
        assertGe(trial, 2, "passes trials 0 and 1");
        assertLt(trial, Puzzles.TRIALS, "but fails one of the eight random trials");
        _revealReverts(alice, p, salt, abi.encodeWithSelector(Proofkin.SolveFailed.selector, trial));
    }

    /// A constant 0 matches QUORUM7 whenever the quorum is not reached, including the first edge case,
    /// but trial 1 (every vote in, threshold 7) wants 1. Outputs that are too SMALL must fail too.
    function test_aProgramThatUnderstatesTheAnswerIsRejected() public {
        bytes memory p = Prog.build(Prog.QUORUM7, Prog.konst(0), Prog.out(0));
        VM.validate(p);
        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);
        _revealReverts(alice, p, salt, abi.encodeWithSelector(Proofkin.SolveFailed.selector, 1));
    }

    /// SORT8 with its last two output slots exchanged is right in slot 0 and, on trial 0 (all equal),
    /// in every slot; it is only wrong from trial 1 on, and only in slots 6 and 7.
    function test_aProgramThatIsWrongOnlyInALaterOutputSlotIsRejected() public {
        bytes memory p = _solution("SORT8");
        uint256 outputsAt = 4 + 4 * uint8(p[2]);
        (p[outputsAt + 6], p[outputsAt + 7]) = (p[outputsAt + 7], p[outputsAt + 6]);
        VM.validate(p);

        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);
        _revealReverts(alice, p, salt, abi.encodeWithSelector(Proofkin.SolveFailed.selector, 1));
    }

    function test_aRejectedRevealChangesNothing() public {
        bytes memory nodes = bytes.concat(
            Prog.node(Prog.IN, 0, 0, 0), Prog.konst(255), Prog.node(Prog.SUB, 0, 1, 0)
        );
        bytes memory p = Prog.build(Prog.QUORUM7, nodes, Prog.out(2));
        (bytes32 salt, bytes32 h) = _commit(alice, p);
        uint256 cb = block.number;
        vm.roll(cb + 3);
        _revealReverts(alice, p, salt, abi.encodeWithSelector(Proofkin.SolveFailed.selector, 0));

        assertEq(proofkin.totalSupply(), 0);
        assertEq(proofkin.solvedCount(0), 0);
        assertEq(proofkin.bestNodes(0), 255);
        assertFalse(proofkin.seen(keccak256(p)));
        assertEq(proofkin.commitBlock(h), cb);
    }

    // ----------------------------------------------------------- a successful mint

    function test_eachFixtureMintsWithTheRightTokenData() public {
        for (uint256 k; k < 6; ++k) {
            bytes memory p = _solution(names[k]);
            uint256 id = _mintAs(alice, p);

            IProofkin.Token memory t = _token(id);
            assertEq(id, k + 1, "ids are sequential from 1");
            assertEq(
                abi.encode(SSTORE2.read(t.program)), abi.encode(p), "program stored at the pointer"
            );
            assertEq(t.puzzleId, k, names[k]);
            assertEq(t.nodeCount, nodeCounts[k], names[k]);
            assertEq(t.depth, depths[k], string.concat(names[k], " depth"));
            assertEq(t.rank, 1);
            assertTrue(t.recordAtMint, "the first solver sets the record (best starts at 255)");
            assertTrue(t.seed != bytes32(0));

            assertEq(proofkin.bestNodes(k), nodeCounts[k]);
            assertEq(proofkin.solvedCount(k), 1);
            assertTrue(proofkin.seen(keccak256(p)));
            assertEq(proofkin.ownerOf(id), alice);
        }
        assertEq(proofkin.totalSupply(), 6);
        assertEq(proofkin.balanceOf(alice), 6);
    }

    /// A guard and a measurement: what a solver pays in gas to mint each fixture.
    function test_revealGasPerFixture() public {
        for (uint256 k; k < 6; ++k) {
            bytes memory p = _solution(names[k]);
            (bytes32 salt,) = _commit(alice, p);
            vm.roll(block.number + 3);
            uint256 price = proofkin.mintPrice();
            deal(alice, price);

            vm.prank(alice);
            uint256 before = gasleft();
            proofkin.reveal{value: price}(p, salt);
            uint256 used = before - gasleft();

            emit log_named_uint(string.concat("reveal gas, ", names[k]), used);
            assertLt(used, 3_000_000, names[k]);
        }
    }

    function test_theStoredSeedReplaysTheSolve() public {
        for (uint256 k; k < 6; ++k) {
            uint256 id = _mintAs(alice, _solution(names[k]));
            IProofkin.Token memory t = _token(id);
            assertEq(
                _firstFailingTrial(SSTORE2.read(t.program), t.seed),
                Puzzles.trialCount(t.puzzleId),
                names[k]
            );
        }
    }

    /// A token is two storage slots: the seed alone, then the program pointer with the small fields. It
    /// was three, because the 20-byte pointer came first and the 32-byte seed cannot share a slot with it.
    function test_aTokenFillsExactlyTwoStorageSlots() public {
        uint256 id = _mintAs(alice, _solution("MEDIAN5"));
        IProofkin.Token memory t = _token(id);

        vm.record();
        proofkin.tokens(id);
        (bytes32[] memory reads,) = vm.accesses(address(proofkin));

        bytes32[] memory slots = new bytes32[](reads.length);
        uint256 distinct;
        for (uint256 i; i < reads.length; ++i) {
            bool known;
            for (uint256 j; j < distinct; ++j) {
                if (slots[j] == reads[i]) known = true;
            }
            if (!known) slots[distinct++] = reads[i];
        }
        assertEq(distinct, 2, "the getter touches two slots");
        assertEq(uint256(slots[1]), uint256(slots[0]) + 1, "next to each other");
        assertEq(vm.load(address(proofkin), slots[0]), t.seed, "the seed alone fills the first");
        assertEq(
            address(uint160(uint256(vm.load(address(proofkin), slots[1])))),
            t.program,
            "the pointer sits in the low bytes of the second"
        );
    }

    function test_revealMintsToTheCallerAndClearsTheCommit() public {
        bytes memory p = _solution("MEDIAN5");
        (bytes32 salt, bytes32 h) = _commit(bob, p);
        vm.roll(block.number + 3);
        _reveal(bob, p, salt);

        assertEq(proofkin.ownerOf(1), bob);
        assertEq(proofkin.commitBlock(h), 0, "the commit is deleted");
        _revealReverts(bob, p, salt, _err(Proofkin.NoCommit.selector)); // so it cannot be replayed
    }

    function test_emitsSolved() public {
        bytes memory p = _solution("SORT8");
        (bytes32 salt,) = _commit(alice, p);
        vm.roll(block.number + 3);
        uint256 price = proofkin.mintPrice();
        deal(alice, price);

        vm.expectEmit(true, true, true, true, address(proofkin));
        emit Proofkin.Solved(1, 2, alice, 46, 1);
        vm.prank(alice);
        proofkin.reveal{value: price}(p, salt);
    }

    function test_mintUsesMintNotSafeMint() public {
        ContractMinter wallet = new ContractMinter(proofkin);
        bytes memory p = _solution("SORT8");
        bytes32 salt = _salt(p, address(wallet));
        wallet.commit(_commitHash(p, address(wallet), salt));
        vm.roll(block.number + 3);

        deal(address(wallet), MINT_PRICE);
        wallet.reveal{value: MINT_PRICE}(p, salt); // would revert under _safeMint: the wallet cannot receive ERC721s
        assertEq(proofkin.ownerOf(1), address(wallet));
    }

    // ------------------------------------------------------- ranks and records

    /// QUORUM7 solutions of 19, 17, 17 and 18 nodes, minted in that order.
    function test_rankFollowsSolveOrderAndRecordsNeedStrictlyFewerNodes() public {
        bytes memory base = _solution("QUORUM7"); // 17 nodes
        _mintAs(alice, Variants.pad(base, 2)); // 19
        _mintAs(alice, base); // 17
        _mintAs(alice, Variants.swap(base, 1)); // 17 again
        _mintAs(alice, Variants.pad(base, 1)); // 18

        assertEq(_token(1).nodeCount, 19);
        assertEq(_token(2).nodeCount, 17);
        assertEq(_token(3).nodeCount, 17);
        assertEq(_token(4).nodeCount, 18);

        for (uint256 id = 1; id <= 4; ++id) {
            assertEq(_token(id).rank, id, "rank is solve order within the puzzle");
        }
        assertTrue(_token(1).recordAtMint, "first: below the initial 255");
        assertTrue(_token(2).recordAtMint, "17 < 19");
        assertFalse(_token(3).recordAtMint, "17 is not < 17");
        assertFalse(_token(4).recordAtMint, "18 is not < 17");
        assertEq(proofkin.bestNodes(0), 17);
    }

    function test_ranksAndRecordsArePerPuzzle() public {
        _mintAs(alice, _solution("SORT8"));
        _mintAs(alice, _solution("QUORUM7"));
        assertEq(_token(1).rank, 1);
        assertEq(_token(2).rank, 1, "first solver of its own puzzle");
        assertTrue(_token(2).recordAtMint);
        assertEq(proofkin.bestNodes(2), 46);
        assertEq(proofkin.bestNodes(0), 17);
    }
}
