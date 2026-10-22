// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Puzzles} from "./Puzzles.sol";

/// @title VM
/// @notice Validates and executes Proofkin programs: straight-line DAGs of at most 64 nodes, so
///         gas is bounded by construction. Mirrored by `packages/vm/src/vm.ts`.
///
/// @dev Encoding (all lengths in bytes):
///        [0] version == 1   [1] puzzleId 0..5   [2] nodeCount 1..64   [3] outCount
///        [4 .. 4+4n)        nodes, 4 bytes each: op, a, b, c
///        [4+4n .. +outCount) output slots, one node index each
///      Total length is exactly `4 + 4 * nodeCount + outCount`.
///
///      Ops (v[i] is the value of node i; unused fields must be 0):
///        0 IN c=input index  1 CONST (a << 8) | b  2 ADD  3 SUB  4 MUL  5 DIV (floor)  6 MIN  7 MAX
///        8 LT  9 EQ  10 AND  11 OR (logical, results 0/1)  12 SEL a != 0 ? v[b] : v[c]
///      Binary ops use a and b. Values are uint32; overflow, underflow and division by zero make
///      `run` return `ok = false` instead of reverting.
///
///      Rule 8 of the spec (a program may be minted once) needs storage, so it is enforced in
///      Proofkin.sol, not here.
library VM {
    // Rule 1
    error BadLength();
    error BadVersion();
    error BadPuzzle();
    // Rule 2
    error BadNodeCount();
    error BadOutCount();
    // Rule 3
    error BadOpcode(uint256 node);
    error UnusedFieldNotZero(uint256 node);
    // Rule 4
    error OperandNotEarlier(uint256 node);
    // Rule 5
    error BadInputIndex(uint256 node);
    // Rule 6 (reports the output slot)
    error BadOutputIndex(uint256 slot);
    // Rule 7
    error DeadNode(uint256 node);

    uint256 internal constant VERSION = 1;
    uint256 internal constant MAX_NODES = 64;
    uint256 internal constant MAX_VALUE = type(uint32).max;

    uint256 internal constant IN = 0;
    uint256 internal constant CONST = 1;
    uint256 internal constant ADD = 2;
    uint256 internal constant SUB = 3;
    uint256 internal constant MUL = 4;
    uint256 internal constant DIV = 5;
    uint256 internal constant MIN = 6;
    uint256 internal constant MAX = 7;
    uint256 internal constant LT = 8;
    uint256 internal constant EQ = 9;
    uint256 internal constant AND = 10;
    uint256 internal constant OR = 11;
    uint256 internal constant SEL = 12;

    /// @notice Reverts with a specific custom error if `program` breaks a structural rule (1-7).
    /// @dev Checks run in a fixed order so the first failure is deterministic: header (length < 4,
    ///      version, puzzleId, nodeCount, outCount, total length), then each node in index order
    ///      (opcode, unused fields, operands, IN index), then output indices, then dead code.
    function validate(bytes memory program) internal pure {
        if (program.length < 4) revert BadLength();
        if (uint8(program[0]) != VERSION) revert BadVersion();
        uint256 puzzleId = uint8(program[1]);
        if (puzzleId >= Puzzles.PUZZLE_COUNT) revert BadPuzzle();
        uint256 n = uint8(program[2]);
        if (n == 0 || n > MAX_NODES) revert BadNodeCount();
        uint256 outCount = uint8(program[3]);
        if (outCount != Puzzles.outputCount(puzzleId)) revert BadOutCount();
        if (program.length != 4 + 4 * n + outCount) revert BadLength();

        uint256 inputs = Puzzles.inputCount(puzzleId);
        for (uint256 i; i < n; ++i) {
            uint256 off = 4 + 4 * i;
            uint256 op = uint8(program[off]);
            uint256 a = uint8(program[off + 1]);
            uint256 b = uint8(program[off + 2]);
            uint256 c = uint8(program[off + 3]);
            if (op > SEL) revert BadOpcode(i);

            if (op == IN) {
                if (a != 0 || b != 0) revert UnusedFieldNotZero(i);
                if (c >= inputs) revert BadInputIndex(i);
            } else if (op == CONST) {
                if (c != 0) revert UnusedFieldNotZero(i);
            } else if (op == SEL) {
                if (a >= i || b >= i || c >= i) revert OperandNotEarlier(i);
            } else {
                if (c != 0) revert UnusedFieldNotZero(i);
                if (a >= i || b >= i) revert OperandNotEarlier(i);
            }
        }

        // Bit i of `live` is set once node i is known to feed an output.
        uint256 live;
        uint256 outputsAt = 4 + 4 * n;
        for (uint256 s; s < outCount; ++s) {
            uint256 o = uint8(program[outputsAt + s]);
            if (o >= n) revert BadOutputIndex(s);
            live |= uint256(1) << o;
        }
        for (uint256 i = n; i > 0;) {
            --i;
            if (live & (uint256(1) << i) == 0) continue;
            uint256 off = 4 + 4 * i;
            uint256 op = uint8(program[off]);
            if (op == IN || op == CONST) continue;
            live |= (uint256(1) << uint8(program[off + 1]))
                | (uint256(1) << uint8(program[off + 2]));
            if (op == SEL) live |= uint256(1) << uint8(program[off + 3]);
        }
        for (uint256 i; i < n; ++i) {
            if (live & (uint256(1) << i) == 0) revert DeadNode(i);
        }
    }

    /// @notice Executes a program that has passed `validate`.
    /// @dev `inputs` must cover the puzzle's input count and hold uint32 values. Evaluation halts
    ///      at the first failing node (overflow, underflow, division by zero): `ok` is false,
    ///      `outputs` is empty, and that node's value and every later one stay 0.
    function run(bytes memory program, uint256[] memory inputs)
        internal
        pure
        returns (bool ok, uint256[] memory outputs, uint256[] memory values)
    {
        uint256 n = uint8(program[2]);
        values = new uint256[](n);

        for (uint256 i; i < n; ++i) {
            uint256 off = 4 + 4 * i;
            (bool good, uint256 v) = _eval(
                uint8(program[off]),
                uint8(program[off + 1]),
                uint8(program[off + 2]),
                uint8(program[off + 3]),
                values,
                inputs
            );
            if (!good) return (false, new uint256[](0), values);
            values[i] = v;
        }

        uint256 outCount = uint8(program[3]);
        uint256 outputsAt = 4 + 4 * n;
        outputs = new uint256[](outCount);
        for (uint256 s; s < outCount; ++s) {
            outputs[s] = values[uint8(program[outputsAt + s])];
        }
        return (true, outputs, values);
    }

    /// @notice Depth of every node in a program that has passed `validate`: 0 for IN and CONST,
    ///         otherwise 1 + the deepest operand. The depth of a token is the deepest output, which
    ///         (with no dead code) is also the deepest node.
    function depths(bytes memory program) internal pure returns (uint256[] memory d) {
        uint256 n = uint8(program[2]);
        d = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            uint256 off = 4 + 4 * i;
            uint256 op = uint8(program[off]);
            if (op == IN || op == CONST) continue;

            uint256 deepest = d[uint8(program[off + 1])];
            uint256 b = d[uint8(program[off + 2])];
            if (b > deepest) deepest = b;
            if (op == SEL) {
                uint256 c = d[uint8(program[off + 3])];
                if (c > deepest) deepest = c;
            }
            d[i] = deepest + 1;
        }
    }

    /// @dev One node. `ok` is false on arithmetic failure; operands are already-computed uint32
    ///      values, so the uint256 sum and product below cannot themselves overflow.
    function _eval(
        uint256 op,
        uint256 a,
        uint256 b,
        uint256 c,
        uint256[] memory values,
        uint256[] memory inputs
    ) private pure returns (bool ok, uint256 v) {
        if (op == IN) return (true, inputs[c]);
        if (op == CONST) return (true, (a << 8) | b);

        uint256 x = values[a];
        uint256 y = values[b];
        if (op == ADD) {
            v = x + y;
        } else if (op == SUB) {
            if (x < y) return (false, 0);
            v = x - y;
        } else if (op == MUL) {
            v = x * y;
        } else if (op == DIV) {
            if (y == 0) return (false, 0);
            v = x / y;
        } else if (op == MIN) {
            v = x < y ? x : y;
        } else if (op == MAX) {
            v = x > y ? x : y;
        } else if (op == LT) {
            v = x < y ? 1 : 0;
        } else if (op == EQ) {
            v = x == y ? 1 : 0;
        } else if (op == AND) {
            v = x != 0 && y != 0 ? 1 : 0;
        } else if (op == OR) {
            v = x != 0 || y != 0 ? 1 : 0;
        } else {
            v = x != 0 ? y : values[c]; // SEL
        }
        ok = v <= MAX_VALUE;
    }
}
