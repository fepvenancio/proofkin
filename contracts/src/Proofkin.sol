// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "solady/auth/Ownable.sol";
import {ERC721} from "solady/tokens/ERC721.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {IProofkin} from "./IProofkin.sol";
import {IRenderer} from "./IRenderer.sol";
import {Puzzles} from "./Puzzles.sol";
import {VM} from "./VM.sol";

/// @title Proofkin
/// @notice A collection you cannot buy a token from: you solve one. A token is a program that solves
///         one of six puzzles, checked by running it on the contract's own inputs.
///
/// @dev Minting is two transactions so a solution cannot be copied out of the mempool:
///
///      1. `commit(h)` with `h = keccak256(abi.encode(program, msg.sender, salt))`. The hash binds the
///         program to the committer, so nobody else can reveal it.
///      2. From the third block after the commit and up to 250 blocks after it, `reveal(program, salt)`.
///         The inputs the program is tested on come from `seed = keccak256(abi.encode(
///         blockhash(commitBlock + 2), h))`. That depends on neither the reveal's timing nor its
///         sender, so revealing later cannot be used to shop for friendlier inputs. It is not known at
///         commit time, but it is known to everyone from block `commitBlock + 2` on, and the committer
///         may simply never reveal: someone willing to pay for several commits of one program can keep
///         the reveal whose seed it passes. "Solved" means passing 2 fixed and 8 seeded trials, not a
///         proof of correctness.
///
///      The sequencer (or any block producer) can influence `blockhash`, so the seed is not
///      unbiasable. That is acceptable here: the stakes are an art project's mint order.
///
///      Reveal follows checks-effects-interactions. The only external call in the contract is the ETH
///      transfer in `withdraw`; `_mint` (not `_safeMint`) calls nobody, so a contract wallet can mint
///      and no receiver can re-enter.
contract Proofkin is ERC721, Ownable {
    // commit / reveal
    error AlreadyCommitted();
    error NoCommit();
    error TooEarly();
    error Expired();
    error NoBlockhash();
    error WrongPayment();
    // the program
    error AlreadyMinted();
    error PuzzleFull();
    error SolveFailed(uint256 trial);
    // admin
    error InvalidRenderer();
    error RendererLocked();

    event Solved(
        uint256 indexed tokenId,
        uint8 indexed puzzleId,
        address indexed author,
        uint8 nodeCount,
        uint16 rank
    );

    /// @dev A reveal needs `block.number > commitBlock + REVEAL_DELAY`; `blockhash(commitBlock + REVEAL_DELAY)`
    ///      is then settled.
    uint256 public constant REVEAL_DELAY = 2;
    /// @dev Last block, relative to the commit, a reveal is accepted in. `blockhash` only reaches 256 blocks back.
    uint256 public constant REVEAL_WINDOW = 250;
    /// @dev Solutions per puzzle; 6 puzzles make a supply of 300.
    uint256 public constant SLOTS = 50;

    /// @notice What `reveal` must be paid. May be zero.
    uint256 public immutable mintPrice;

    address public renderer;
    bool public rendererLocked;

    /// @notice Tokens minted so far; ids run 1, 2, 3, ... in mint order.
    uint256 public totalSupply;

    /// @notice Block of each outstanding commit; 0 if there is none.
    mapping(bytes32 => uint256) public commitBlock;
    /// @notice Whether `keccak256(program)` has been minted. Uniqueness is of the bytes, not behaviour.
    mapping(bytes32 => bool) public seen;
    mapping(uint256 => IProofkin.Token) public tokens;
    /// @notice Smallest node count solved so far per puzzle; 255 until the first solve.
    uint8[6] public bestNodes;
    uint8[6] public solvedCount;

    constructor(address owner_, address renderer_, uint256 mintPrice_) {
        _initializeOwner(owner_);
        _setRenderer(renderer_);
        mintPrice = mintPrice_;
        for (uint256 p; p < 6; ++p) {
            bestNodes[p] = 255;
        }
    }

    function name() public pure override returns (string memory) {
        return "Proofkin";
    }

    function symbol() public pure override returns (string memory) {
        return "PKIN";
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        if (!_exists(id)) revert TokenDoesNotExist();
        return IRenderer(renderer).tokenURI(id);
    }

    // ---------------------------------------------------------------- minting

    /// @notice Step one of minting. `h` is `keccak256(abi.encode(program, msg.sender, salt))`.
    function commit(bytes32 h) external {
        if (commitBlock[h] != 0) revert AlreadyCommitted();
        commitBlock[h] = block.number;
    }

    /// @notice Step two: prove the program solves its puzzle and mint it to the caller.
    /// @dev A reveal that reverts leaves its commit in place, so one that failed only on timing can be
    ///      repeated. One that failed on the program itself needs a new commit, because the hash
    ///      includes the program.
    function reveal(bytes calldata program, bytes32 salt) external payable {
        bytes32 h = keccak256(abi.encode(program, msg.sender, salt));
        bytes32 seed = _seedFor(h);
        if (msg.value != mintPrice) revert WrongPayment();

        bytes memory p = program;
        VM.validate(p);
        bytes32 programHash = keccak256(p);
        if (seen[programHash]) revert AlreadyMinted();
        uint256 puzzleId = uint8(p[1]);
        if (solvedCount[puzzleId] >= SLOTS) revert PuzzleFull();
        _requireSolves(p, puzzleId, seed);

        // effects
        delete commitBlock[h];
        seen[programHash] = true;
        uint16 rank = uint16(++solvedCount[puzzleId]);
        uint8 nodeCount = uint8(p[2]);
        bool recordAtMint = nodeCount < bestNodes[puzzleId];
        if (recordAtMint) bestNodes[puzzleId] = nodeCount;
        uint256 id = ++totalSupply;

        // The program is deployed as contract code (SSTORE2) and cannot call back; nothing external runs.
        tokens[id] = IProofkin.Token({
            program: SSTORE2.write(p),
            seed: seed,
            puzzleId: uint8(puzzleId),
            nodeCount: nodeCount,
            depth: _depth(p),
            rank: rank,
            recordAtMint: recordAtMint
        });
        _mint(msg.sender, id);

        emit Solved(id, uint8(puzzleId), msg.sender, nodeCount, rank);
    }

    /// @dev The seed for the commit `h`, after checking that it exists and is inside its reveal window.
    function _seedFor(bytes32 h) private view returns (bytes32) {
        uint256 committedAt = commitBlock[h];
        // slither-disable-next-line incorrect-equality -- 0 means "no commit"; a commit stores block.number, which is never 0
        if (committedAt == 0) revert NoCommit();
        if (block.number <= committedAt + REVEAL_DELAY) revert TooEarly();
        if (block.number > committedAt + REVEAL_WINDOW) revert Expired();

        bytes32 blockHash = blockhash(committedAt + REVEAL_DELAY);
        // slither-disable-next-line incorrect-equality -- blockhash() returns exactly 0 for a block it no longer holds
        if (blockHash == bytes32(0)) revert NoBlockhash();
        return keccak256(abi.encode(blockHash, h));
    }

    /// @dev All 10 trials must run without arithmetic failure and give exactly the reference outputs.
    function _requireSolves(bytes memory p, uint256 puzzleId, bytes32 seed) private pure {
        for (uint256 trial; trial < Puzzles.TRIALS; ++trial) {
            uint256[] memory x = Puzzles.inputs(puzzleId, seed, trial);
            // slither-disable-next-line unused-return -- only the success flag and the outputs matter here
            (bool ok, uint256[] memory got,) = VM.run(p, x);
            if (!ok || !_same(got, Puzzles.referenceOutputs(puzzleId, x))) {
                revert SolveFailed(trial);
            }
        }
    }

    function _same(uint256[] memory a, uint256[] memory b) private pure returns (bool) {
        if (a.length != b.length) return false;
        for (uint256 i; i < a.length; ++i) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }

    /// @dev Longest path from an IN/CONST node to an output: the deepest output.
    function _depth(bytes memory p) private pure returns (uint8) {
        uint256[] memory d = VM.depths(p);
        uint256 outputsAt = 4 + 4 * uint8(p[2]);
        uint256 deepest = 0;
        for (uint256 s; s < uint8(p[3]); ++s) {
            uint256 nodeDepth = d[uint8(p[outputsAt + s])];
            if (nodeDepth > deepest) deepest = nodeDepth;
        }
        return uint8(deepest);
    }

    // ------------------------------------------------------------------ admin

    /// @notice Point `tokenURI` at another renderer, until `lockRenderer` is called.
    function setRenderer(address renderer_) external onlyOwner {
        if (rendererLocked) revert RendererLocked();
        _setRenderer(renderer_);
    }

    /// @notice Freeze the renderer for good. There is no way back.
    function lockRenderer() external onlyOwner {
        rendererLocked = true;
    }

    /// @notice Send the contract's whole balance (the mint fees) to the owner.
    function withdraw() external onlyOwner {
        SafeTransferLib.safeTransferAllETH(owner());
    }

    function _setRenderer(address renderer_) private {
        if (renderer_ == address(0)) revert InvalidRenderer();
        renderer = renderer_;
    }
}
