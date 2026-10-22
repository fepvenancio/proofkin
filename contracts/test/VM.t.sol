// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VM} from "../src/VM.sol";
import {Puzzles} from "../src/Puzzles.sol";
import {VMHarness} from "./helpers/VMHarness.sol";

contract VMTest is Test {
    VMHarness h = new VMHarness();

    uint8 constant QUORUM7 = 0; // 8 inputs, 1 output
    uint8 constant SORT8 = 2; // 8 inputs, 8 outputs
    uint256 constant MAX32 = type(uint32).max;

    uint8 constant IN = 0;
    uint8 constant CONST = 1;
    uint8 constant ADD = 2;
    uint8 constant SUB = 3;
    uint8 constant MUL = 4;
    uint8 constant DIV = 5;
    uint8 constant MIN = 6;
    uint8 constant MAX = 7;
    uint8 constant LT = 8;
    uint8 constant EQ = 9;
    uint8 constant AND = 10;
    uint8 constant OR = 11;
    uint8 constant SEL = 12;

    // ------------------------------------------------------------ builders

    function _n(uint8 op, uint8 a, uint8 b, uint8 c) private pure returns (bytes memory) {
        return abi.encodePacked(op, a, b, c);
    }

    function _raw(
        uint8 version,
        uint8 puzzle,
        uint8 nodeCount,
        uint8 outCount,
        bytes memory nodes,
        bytes memory outs
    ) private pure returns (bytes memory) {
        return abi.encodePacked(version, puzzle, nodeCount, outCount, nodes, outs);
    }

    /// @dev Header fields are derived from `nodes` (4 bytes each) and `outs` (1 byte each).
    function _p(uint8 puzzle, bytes memory nodes, bytes memory outs)
        private
        pure
        returns (bytes memory)
    {
        return _raw(1, puzzle, uint8(nodes.length / 4), uint8(outs.length), nodes, outs);
    }

    function _o(uint8 a) private pure returns (bytes memory) {
        return abi.encodePacked(a);
    }

    /// @dev `n` nodes: IN, then MAX(prev, node 0) repeatedly. Every node feeds the next.
    function _chain(uint256 n) private pure returns (bytes memory nodes) {
        nodes = _n(IN, 0, 0, 0);
        for (uint256 i = 1; i < n; ++i) {
            nodes = bytes.concat(nodes, _n(MAX, uint8(i - 1), 0, 0));
        }
    }

    function _ok(bytes memory program) private view {
        h.validate(program);
    }

    function _bad(bytes memory program, bytes4 err) private {
        vm.expectRevert(err);
        h.validate(program);
    }

    function _bad(bytes memory program, bytes4 err, uint256 index) private {
        vm.expectRevert(abi.encodeWithSelector(err, index));
        h.validate(program);
    }

    /// @dev QUORUM7 program whose single output is `op(inputs[0], inputs[1])`.
    function _binary(uint8 op) private pure returns (bytes memory) {
        return _p(QUORUM7, bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1), _n(op, 0, 1, 0)), _o(2));
    }

    function _in8(uint256 x, uint256 y) private pure returns (uint256[] memory v) {
        v = new uint256[](8);
        v[0] = x;
        v[1] = y;
    }

    function _exec(uint8 op, uint256 x, uint256 y) private view returns (bool ok, uint256 out) {
        uint256[] memory outputs;
        (ok, outputs,) = h.run(_binary(op), _in8(x, y));
        out = ok ? outputs[0] : 0;
    }

    // -------------------------------------------------------- validate: accepts

    function test_validate_acceptsSmallestProgram() public view {
        _ok(_p(QUORUM7, _n(IN, 0, 0, 0), _o(0)));
    }

    function test_validate_accepts64Nodes() public view {
        _ok(_p(QUORUM7, _chain(64), _o(63)));
    }

    function test_validate_acceptsRepeatedAndInputOutputs() public view {
        bytes memory nodes = bytes.concat(_n(IN, 0, 0, 0), _n(CONST, 1, 2, 0));
        _ok(_p(SORT8, nodes, hex"0000010100010001"));
    }

    function test_validate_acceptsEveryOpcodeInOneLiveChain() public view {
        // Each node reads the previous one, so nothing is dead. (Chunked: a single 13-argument
        // bytes.concat overflows the stack.)
        bytes memory nodes = bytes.concat(
            _n(IN, 0, 0, 0), // 0
            _n(CONST, 1, 2, 0), // 1
            _n(ADD, 0, 1, 0), // 2
            _n(SUB, 2, 0, 0) // 3
        );
        nodes = bytes.concat(
            nodes,
            _n(MUL, 3, 1, 0), // 4
            _n(DIV, 4, 1, 0), // 5
            _n(MIN, 5, 0, 0), // 6
            _n(MAX, 6, 1, 0) // 7
        );
        nodes = bytes.concat(
            nodes,
            _n(LT, 7, 0, 0), // 8
            _n(EQ, 8, 0, 0), // 9
            _n(AND, 9, 1, 0), // 10
            _n(OR, 10, 0, 0) // 11
        );
        nodes = bytes.concat(nodes, _n(SEL, 11, 10, 0)); // 12
        _ok(_p(QUORUM7, nodes, _o(12)));
    }

    // ------------------------------------------------ validate: rule 1

    function test_validate_rejectsProgramsTooShortForAHeader() public {
        _bad(hex"", VM.BadLength.selector);
        _bad(hex"010001", VM.BadLength.selector);
    }

    function test_validate_rejectsBadVersion() public {
        uint8[3] memory versions = [0, 2, 255];
        for (uint256 i; i < 3; ++i) {
            _bad(_raw(versions[i], QUORUM7, 1, 1, _n(IN, 0, 0, 0), _o(0)), VM.BadVersion.selector);
        }
    }

    function test_validate_rejectsBadPuzzleId() public {
        uint8[3] memory ids = [6, 7, 255];
        for (uint256 i; i < 3; ++i) {
            _bad(_raw(1, ids[i], 1, 1, _n(IN, 0, 0, 0), _o(0)), VM.BadPuzzle.selector);
        }
    }

    function test_validate_rejectsTrailingByteAndTruncatedBody() public {
        bytes memory ok = _p(QUORUM7, _n(IN, 0, 0, 0), _o(0));
        _bad(bytes.concat(ok, hex"00"), VM.BadLength.selector);
        bytes memory truncated = new bytes(ok.length - 1);
        for (uint256 i; i < truncated.length; ++i) {
            truncated[i] = ok[i];
        }
        _bad(truncated, VM.BadLength.selector);
    }

    // ------------------------------------------------ validate: rule 2

    function test_validate_rejectsNodeCount0And65() public {
        _bad(_raw(1, QUORUM7, 0, 1, "", _o(0)), VM.BadNodeCount.selector);
        _bad(_raw(1, QUORUM7, 65, 1, _chain(65), _o(64)), VM.BadNodeCount.selector);
    }

    function test_validate_rejectsWrongOutCount() public {
        _bad(_p(QUORUM7, _n(IN, 0, 0, 0), hex"0000"), VM.BadOutCount.selector);
        _bad(_p(SORT8, _n(IN, 0, 0, 0), _o(0)), VM.BadOutCount.selector);
    }

    // ------------------------------------------------ validate: rule 3

    function test_validate_rejectsInvalidOpcodes() public {
        uint8[3] memory ops = [13, 14, 255];
        for (uint256 i; i < 3; ++i) {
            _bad(
                _p(QUORUM7, bytes.concat(_n(IN, 0, 0, 0), _n(ops[i], 0, 0, 0)), _o(1)),
                VM.BadOpcode.selector,
                1
            );
        }
    }

    function test_validate_rejectsNonZeroUnusedFields() public {
        bytes4 err = VM.UnusedFieldNotZero.selector;
        _bad(_p(QUORUM7, _n(IN, 1, 0, 0), _o(0)), err, 0); // IN.a
        _bad(_p(QUORUM7, _n(IN, 0, 1, 0), _o(0)), err, 0); // IN.b
        _bad(_p(QUORUM7, _n(CONST, 1, 1, 1), _o(0)), err, 0); // CONST.c
        _bad(_p(QUORUM7, bytes.concat(_n(IN, 0, 0, 0), _n(ADD, 0, 0, 1)), _o(1)), err, 1); // ADD.c
    }

    function test_validate_constCarriesAnyAB_andSelUsesAllThree() public view {
        _ok(
            _p(
                QUORUM7,
                bytes.concat(_n(CONST, 255, 255, 0), _n(CONST, 0, 1, 0), _n(SEL, 0, 0, 1)),
                _o(2)
            )
        );
    }

    // ------------------------------------------------ validate: rule 4

    function test_validate_rejectsOperandsNotBeforeTheNode() public {
        bytes4 err = VM.OperandNotEarlier.selector;
        bytes memory in0 = _n(IN, 0, 0, 0);
        _bad(_p(QUORUM7, bytes.concat(in0, _n(ADD, 1, 0, 0)), _o(1)), err, 1); // a == i
        _bad(_p(QUORUM7, bytes.concat(in0, _n(ADD, 0, 1, 0)), _o(1)), err, 1); // b == i
        _bad(_p(QUORUM7, bytes.concat(in0, _n(ADD, 0, 5, 0)), _o(1)), err, 1); // b > i
        _bad(_p(QUORUM7, bytes.concat(in0, _n(SEL, 0, 0, 1)), _o(1)), err, 1); // SEL c == i
        _bad(_p(QUORUM7, _n(ADD, 0, 0, 0), _o(0)), err, 0); // any op at node 0
    }

    function test_validate_acceptsSameOperandTwice() public view {
        _ok(_p(QUORUM7, bytes.concat(_n(IN, 0, 0, 0), _n(ADD, 0, 0, 0)), _o(1)));
    }

    // ------------------------------------------------ validate: rule 5

    function test_validate_inputIndexBoundary() public {
        _ok(_p(QUORUM7, _n(IN, 0, 0, 7), _o(0)));
        _bad(_p(QUORUM7, _n(IN, 0, 0, 8), _o(0)), VM.BadInputIndex.selector, 0);
    }

    // ------------------------------------------------ validate: rule 6

    function test_validate_rejectsOutputPastNodeCount_reportingTheSlot() public {
        bytes memory nodes = bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1));
        _bad(_p(SORT8, nodes, hex"0001000100020001"), VM.BadOutputIndex.selector, 5);
    }

    // ------------------------------------------------ validate: rule 7

    function test_validate_rejectsDeadNode() public {
        _bad(
            _p(QUORUM7, bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1)), _o(0)),
            VM.DeadNode.selector,
            1
        );
    }

    function test_validate_reportsLowestDeadNode() public {
        bytes memory nodes =
            bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1), _n(ADD, 1, 1, 0), _n(ADD, 0, 0, 0));
        _bad(_p(QUORUM7, nodes, _o(3)), VM.DeadNode.selector, 1);
    }

    function test_validate_selCOperandKeepsANodeLive() public view {
        bytes memory nodes = bytes.concat(
            _n(CONST, 0, 1, 0), _n(CONST, 0, 2, 0), _n(CONST, 0, 3, 0), _n(SEL, 0, 1, 2)
        );
        _ok(_p(QUORUM7, nodes, _o(3)));
    }

    // --------------------------------------- validate: which error wins

    function test_validate_headerRulesBeatNodeRules() public {
        _bad(_raw(2, QUORUM7, 1, 1, _n(13, 0, 0, 0), _o(0)), VM.BadVersion.selector);
        _bad(_raw(1, QUORUM7, 1, 3, _n(13, 0, 0, 0), _o(0)), VM.BadOutCount.selector);
    }

    function test_validate_withinANodeOpcodeThenUnusedThenOperandThenInput() public {
        _bad(_p(QUORUM7, _n(13, 9, 9, 9), _o(0)), VM.BadOpcode.selector, 0);
        _bad(_p(QUORUM7, _n(ADD, 9, 9, 9), _o(0)), VM.UnusedFieldNotZero.selector, 0);
        _bad(_p(QUORUM7, _n(ADD, 9, 9, 0), _o(0)), VM.OperandNotEarlier.selector, 0);
        _bad(_p(QUORUM7, _n(IN, 0, 0, 99), _o(0)), VM.BadInputIndex.selector, 0);
    }

    function test_validate_lowestFailingNodeIsReported() public {
        _bad(
            _p(QUORUM7, bytes.concat(_n(IN, 0, 0, 99), _n(13, 0, 0, 0)), _o(1)),
            VM.BadInputIndex.selector,
            0
        );
    }

    function test_validate_nodeRulesBeatOutputRules_outputRulesBeatDeadCode() public {
        _bad(_p(QUORUM7, _n(IN, 0, 0, 99), _o(7)), VM.BadInputIndex.selector, 0);
        _bad(
            _p(QUORUM7, bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1)), _o(9)),
            VM.BadOutputIndex.selector,
            0
        );
    }

    // ------------------------------------------------- run: opcode semantics

    function test_run_inReadsInputC_constIsAShiftOrB_valuesHoldEveryNode() public view {
        bytes memory nodes =
            bytes.concat(_n(IN, 0, 0, 3), _n(CONST, 0x12, 0x34, 0), _n(ADD, 0, 1, 0));
        uint256[] memory x = new uint256[](8);
        for (uint256 i; i < 8; ++i) {
            x[i] = 10 + i;
        }
        (bool ok, uint256[] memory outputs, uint256[] memory values) =
            h.run(_p(QUORUM7, nodes, _o(2)), x);
        assertTrue(ok);
        assertEq(outputs.length, 1);
        assertEq(outputs[0], 13 + 0x1234);
        assertEq(values.length, 3);
        assertEq(values[0], 13);
        assertEq(values[1], 0x1234);
        assertEq(values[2], 13 + 0x1234);
    }

    function test_run_constCoversFullRange() public view {
        (, uint256[] memory outputs,) =
            h.run(_p(QUORUM7, _n(CONST, 255, 255, 0), _o(0)), new uint256[](8));
        assertEq(outputs[0], 65_535);
    }

    function _label(uint8 op, uint256 x, uint256 y) private pure returns (string memory) {
        return string.concat("op ", vm.toString(op), " x=", vm.toString(x), " y=", vm.toString(y));
    }

    function _expectResult(uint8 op, uint256 x, uint256 y, uint256 want) private view {
        (bool ok, uint256 out) = _exec(op, x, y);
        assertTrue(ok, _label(op, x, y));
        assertEq(out, want, _label(op, x, y));
    }

    function _expectNotOk(uint8 op, uint256 x, uint256 y) private view {
        (bool ok,) = _exec(op, x, y);
        assertFalse(ok, _label(op, x, y));
    }

    function test_run_opcodeResults() public view {
        _expectResult(ADD, 3, 4, 7);
        _expectResult(ADD, MAX32, 0, MAX32);
        _expectResult(SUB, 5, 3, 2);
        _expectResult(SUB, 3, 3, 0);
        _expectResult(MUL, 1000, 1000, 1_000_000);
        _expectResult(MUL, 65_535, 65_537, MAX32); // lands exactly on the uint32 max
        _expectResult(MUL, MAX32, 0, 0);
        _expectResult(DIV, 7, 2, 3);
        _expectResult(DIV, 0, 5, 0);
        _expectResult(DIV, MAX32, 1, MAX32);
        _expectResult(MIN, 3, 9, 3);
        _expectResult(MIN, 9, 3, 3);
        _expectResult(MAX, 3, 9, 9);
        _expectResult(MAX, 9, 3, 9);
        _expectResult(LT, 1, 2, 1);
        _expectResult(LT, 2, 1, 0);
        _expectResult(LT, 2, 2, 0);
        _expectResult(EQ, 5, 5, 1);
        _expectResult(EQ, 5, 6, 0);
        _expectResult(AND, 2, 3, 1); // logical, not bitwise
        _expectResult(AND, 2, 0, 0);
        _expectResult(AND, 0, 0, 0);
        _expectResult(OR, 0, 0, 0);
        _expectResult(OR, 0, 7, 1);
        _expectResult(OR, 7, 0, 1);
    }

    function test_run_arithmeticFailuresReturnNotOkInsteadOfReverting() public view {
        _expectNotOk(ADD, MAX32, 1); // overflow
        _expectNotOk(ADD, MAX32, MAX32);
        _expectNotOk(SUB, 3, 5); // underflow
        _expectNotOk(MUL, 65_536, 65_536); // exactly 2^32
        _expectNotOk(MUL, MAX32, 2);
        _expectNotOk(DIV, 5, 0); // divide by zero
        _expectNotOk(DIV, 0, 0);
    }

    function _sel() private pure returns (bytes memory) {
        bytes memory nodes =
            bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1), _n(IN, 0, 0, 2), _n(SEL, 0, 1, 2));
        return _p(QUORUM7, nodes, _o(3));
    }

    function _in8(uint256 a, uint256 b, uint256 c) private pure returns (uint256[] memory v) {
        v = new uint256[](8);
        (v[0], v[1], v[2]) = (a, b, c);
    }

    function test_run_selTakesBWhenANonZeroElseC() public view {
        (, uint256[] memory out,) = h.run(_sel(), _in8(1, 10, 20));
        assertEq(out[0], 10);
        (, out,) = h.run(_sel(), _in8(0, 10, 20));
        assertEq(out[0], 20);
        (, out,) = h.run(_sel(), _in8(7, 10, 20));
        assertEq(out[0], 10);
    }

    function test_run_selComputesBothBranches() public view {
        bytes memory nodes = bytes.concat(
            _n(IN, 0, 0, 0), // 0: condition
            _n(IN, 0, 0, 1), // 1: x
            _n(CONST, 0, 0, 0), // 2: zero
            _n(DIV, 1, 2, 0), // 3: x / 0 fails
            _n(SEL, 0, 1, 3) // 4: condition picks the safe branch
        );
        (bool ok,,) = h.run(_p(QUORUM7, nodes, _o(4)), _in8(1, 5));
        assertFalse(ok);
    }

    // ------------------------------------------------ run: failure and shape

    function test_run_haltsAtFirstFailure() public view {
        bytes memory nodes =
            bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1), _n(SUB, 0, 1, 0), _n(ADD, 2, 2, 0));
        (bool ok, uint256[] memory outputs, uint256[] memory values) =
            h.run(_p(QUORUM7, nodes, _o(3)), _in8(1, 5));
        assertFalse(ok);
        assertEq(outputs.length, 0);
        assertEq(values.length, 4);
        assertEq(values[0], 1);
        assertEq(values[1], 5);
        assertEq(values[2], 0);
        assertEq(values[3], 0);
    }

    function test_run_fillsOutputSlotsInOrder() public view {
        bytes memory nodes = bytes.concat(_n(IN, 0, 0, 0), _n(IN, 0, 0, 1));
        (bool ok, uint256[] memory outputs, uint256[] memory values) =
            h.run(_p(SORT8, nodes, hex"0100010001000100"), _in8(5, 9));
        assertTrue(ok);
        assertEq(values.length, 2);
        assertEq(outputs.length, 8);
        for (uint256 i; i < 8; ++i) {
            assertEq(outputs[i], i % 2 == 0 ? 9 : 5);
        }
    }

    // ------------------------------------------------------------- depths

    function _assertDepths(bytes memory program, uint256[] memory want) private pure {
        assertEq(abi.encode(VM.depths(program)), abi.encode(want));
    }

    function _d(uint256 a, uint256 b, uint256 c, uint256 d, uint256 e)
        private
        pure
        returns (uint256[] memory x)
    {
        x = new uint256[](5);
        (x[0], x[1], x[2], x[3], x[4]) = (a, b, c, d, e);
    }

    function test_depths_leavesAreZeroAndEveryOpAddsOneToItsDeepestOperand() public pure {
        bytes memory nodes = bytes.concat(
            _n(IN, 0, 0, 0), // 0: depth 0
            _n(CONST, 0, 9, 0), // 1: depth 0
            _n(ADD, 0, 1, 0) // 2: 1 + max(0, 0)
        );
        nodes = bytes.concat(
            nodes,
            _n(ADD, 2, 0, 0), // 3: 1 + max(1, 0)
            _n(SEL, 0, 3, 2) // 4: 1 + max(0, 2, 1)
        );
        _assertDepths(_p(QUORUM7, nodes, _o(4)), _d(0, 0, 1, 2, 3));
    }

    function test_depths_selThirdOperandCounts() public pure {
        bytes memory nodes = bytes.concat(
            _n(IN, 0, 0, 0),
            _n(CONST, 0, 1, 0),
            _n(ADD, 0, 0, 0),
            _n(ADD, 2, 2, 0),
            _n(SEL, 0, 1, 3)
        );
        _assertDepths(_p(QUORUM7, nodes, _o(4)), _d(0, 0, 1, 2, 3)); // c (node 3, depth 2) is the deepest
    }

    function test_depths_aChainOf64NodesReaches63() public pure {
        uint256[] memory d = VM.depths(_p(QUORUM7, _chain(64), _o(63)));
        assertEq(d.length, 64);
        for (uint256 i; i < 64; ++i) {
            assertEq(d[i], i);
        }
    }

    // ------------------------------------------------------------- fuzz

    /// @dev Deterministic pseudo-random stream keyed by `seed`.
    function _rnd(bytes32 seed, uint256 i) private pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, i)));
    }

    /// @dev Node `i` of a structural program: node 0 is IN or CONST, later nodes any op with
    ///      operands below `i`.
    function _randomNode(bytes32 seed, uint256 i, uint256 nIn) private pure returns (bytes memory) {
        bytes32 s = keccak256(abi.encode(seed, i));
        uint8 op = uint8(_rnd(s, 0) % (i == 0 ? 2 : 13));
        if (op == IN) return _n(IN, 0, 0, uint8(_rnd(s, 1) % nIn));
        if (op == CONST) return _n(CONST, uint8(_rnd(s, 1)), uint8(_rnd(s, 2)), 0);
        uint8 a = uint8(_rnd(s, 1) % i);
        uint8 b = uint8(_rnd(s, 2) % i);
        if (op == SEL) return _n(SEL, a, b, uint8(_rnd(s, 3) % i));
        return _n(op, a, b, 0);
    }

    /// @dev A program that satisfies rules 1-6 (dead code is allowed: `run` does not care).
    function _structuralProgram(bytes32 seed) private pure returns (bytes memory) {
        uint8 puzzle = uint8(_rnd(seed, 0) % 6);
        uint256 n = 1 + _rnd(seed, 1) % 64;
        uint256 nIn = Puzzles.inputCount(puzzle);
        uint256 nOut = Puzzles.outputCount(puzzle);

        bytes memory nodes;
        for (uint256 i; i < n; ++i) {
            nodes = bytes.concat(nodes, _randomNode(seed, i, nIn));
        }
        bytes memory outs = new bytes(nOut);
        for (uint256 s; s < nOut; ++s) {
            outs[s] = bytes1(uint8(_rnd(seed, 1000 + s) % n));
        }
        return _p(puzzle, nodes, outs);
    }

    function testFuzz_runNeverRevertsOnStructurallyValidPrograms(
        bytes32 seed,
        uint32[12] memory raw
    ) public view {
        bytes memory program = _structuralProgram(seed);
        uint256[] memory x = new uint256[](Puzzles.inputCount(uint8(program[1])));
        for (uint256 i; i < x.length; ++i) {
            x[i] = raw[i];
        }

        (bool ok, uint256[] memory outputs, uint256[] memory values) = h.run(program, x);
        assertEq(values.length, uint8(program[2]));
        assertEq(outputs.length, ok ? uint8(program[3]) : 0);
        for (uint256 i; i < values.length; ++i) {
            assertLe(values[i], MAX32);
        }
    }

    function _isKnownError(bytes4 sel) private pure returns (bool) {
        return sel == VM.BadLength.selector || sel == VM.BadVersion.selector
            || sel == VM.BadPuzzle.selector || sel == VM.BadNodeCount.selector
            || sel == VM.BadOutCount.selector || sel == VM.BadOpcode.selector
            || sel == VM.UnusedFieldNotZero.selector || sel == VM.OperandNotEarlier.selector
            || sel == VM.BadInputIndex.selector || sel == VM.BadOutputIndex.selector
            || sel == VM.DeadNode.selector;
    }

    /// @dev Corrupting one byte of a structural program must give either success or one of the
    ///      declared custom errors, never a panic or an empty revert.
    function testFuzz_validateOnlyRevertsWithDeclaredErrors(bytes32 seed, uint256 pos, uint8 value)
        public
        view
    {
        bytes memory program = _structuralProgram(seed);
        program[pos % program.length] = bytes1(value);
        try h.validate(program) {}
        catch (bytes memory reason) {
            assertGe(reason.length, 4);
            assertTrue(_isKnownError(bytes4(reason)), "undeclared revert");
        }
    }
}
