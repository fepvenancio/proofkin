// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Distinct byte strings with the same behaviour as a given solution. Uniqueness in Proofkin is
///      by `keccak256(program)`, so these count as different programs: tests use them to fill a
///      puzzle's slots and to mint solutions of different sizes.
library Variants {
    uint8 private constant ADD = 2;
    uint8 private constant MUL = 4;
    uint8 private constant MIN = 6;
    uint8 private constant MAX = 7;
    uint8 private constant EQ = 9;
    uint8 private constant AND = 10;
    uint8 private constant OR = 11;

    function _swappable(bytes memory p, uint256 i) private pure returns (bool) {
        uint256 off = 4 + 4 * i;
        uint8 op = uint8(p[off]);
        bool commutative =
            op == ADD || op == MUL || op == MIN || op == MAX || op == EQ || op == AND || op == OR;
        return commutative && p[off + 1] != p[off + 2];
    }

    /// @dev Nodes whose two operands can be exchanged without changing what the program computes.
    function swappable(bytes memory p) internal pure returns (uint256 count) {
        for (uint256 i; i < uint8(p[2]); ++i) {
            if (_swappable(p, i)) ++count;
        }
    }

    /// @dev Exchanges the operands of the k-th swappable node for every bit k set in `mask`.
    function swap(bytes memory p, uint256 mask) internal pure returns (bytes memory q) {
        q = bytes.concat(p);
        uint256 k;
        for (uint256 i; i < uint8(p[2]); ++i) {
            if (!_swappable(p, i)) continue;
            if ((mask >> k) & 1 == 1) {
                uint256 off = 4 + 4 * i;
                (q[off + 1], q[off + 2]) = (p[off + 2], p[off + 1]);
            }
            ++k;
        }
    }

    /// @dev Appends `extra` no-op nodes (`MAX x x`) after the node behind output slot 0 and points
    ///      that slot at the last of them: `extra` more nodes, same results, still no dead code.
    function pad(bytes memory p, uint256 extra) internal pure returns (bytes memory q) {
        uint256 n = uint8(p[2]);
        uint256 outCount = uint8(p[3]);
        q = new bytes(p.length + 4 * extra);

        for (uint256 i; i < 4 + 4 * n; ++i) {
            q[i] = p[i];
        }
        q[2] = bytes1(uint8(n + extra));

        uint8 prev = uint8(p[4 + 4 * n]); // output slot 0
        for (uint256 j; j < extra; ++j) {
            uint256 off = 4 + 4 * (n + j);
            q[off] = bytes1(MAX);
            q[off + 1] = bytes1(prev);
            q[off + 2] = bytes1(prev);
            prev = uint8(n + j);
        }

        uint256 outputsAt = 4 + 4 * (n + extra);
        for (uint256 s; s < outCount; ++s) {
            q[outputsAt + s] = p[4 + 4 * n + s];
        }
        if (extra > 0) q[outputsAt] = bytes1(prev);
    }
}
