// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "solady/auth/Ownable.sol";
import {ERC721} from "solady/tokens/ERC721.sol";
import {Base64} from "solady/utils/Base64.sol";
import {LibString} from "solady/utils/LibString.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {Proofkin} from "../src/Proofkin.sol";
import {Renderer} from "../src/Renderer.sol";
import {ProofkinBase} from "./helpers/ProofkinBase.sol";
import {Variants} from "./helpers/Variants.sol";

contract StubRenderer {
    function tokenURI(uint256) external pure returns (string memory) {
        return "stub";
    }
}

/// @dev An owner that tries to withdraw again from inside the ETH transfer it is receiving.
contract ReentrantOwner {
    Proofkin private immutable proofkin;
    uint256 public received;
    bool private entered;

    constructor(Proofkin proofkin_) {
        proofkin = proofkin_;
    }

    function withdraw() external {
        proofkin.withdraw();
    }

    receive() external payable {
        received += msg.value;
        if (!entered) {
            entered = true;
            proofkin.withdraw();
        }
    }
}

/// @dev An owner that cannot receive ETH.
contract RejectingOwner {
    function withdraw(Proofkin proofkin) external {
        proofkin.withdraw();
    }
}

/// @notice PLAN.md §5.4 admin, §5.3 traits through the real Renderer, and the ERC721 basics.
contract ProofkinAdminTest is ProofkinBase {
    string constant JSON_PREFIX = "data:application/json;base64,";
    string constant SVG_PREFIX = "data:image/svg+xml;base64,";
    string constant GOLD_RING_MARK = 'r="292" fill="none" stroke="hsl(46,85%,58%)"';

    function setUp() public {
        _deploy(MINT_PRICE);
    }

    // ------------------------------------------------------------- renderer

    function test_theOwnerCanReplaceTheRendererUntilItIsLocked() public {
        _mintAs(alice, _solution("SORT8"));

        StubRenderer stub = new StubRenderer();
        vm.prank(owner);
        proofkin.setRenderer(address(stub));
        assertEq(proofkin.renderer(), address(stub));
        assertEq(proofkin.tokenURI(1), "stub", "tokenURI follows the renderer");
    }

    function test_onlyTheOwnerCanSetTheRenderer() public {
        StubRenderer stub = new StubRenderer();
        vm.expectRevert(Ownable.Unauthorized.selector);
        vm.prank(alice);
        proofkin.setRenderer(address(stub));
        assertEq(proofkin.renderer(), address(renderer));
    }

    function test_theRendererCannotBeZero() public {
        vm.expectRevert(Proofkin.InvalidRenderer.selector);
        vm.prank(owner);
        proofkin.setRenderer(address(0));

        vm.expectRevert(Proofkin.InvalidRenderer.selector);
        new Proofkin(owner, address(0), 0);
    }

    function test_lockingIsOwnerOnlyAndOneWay() public {
        vm.expectRevert(Ownable.Unauthorized.selector);
        vm.prank(alice);
        proofkin.lockRenderer();
        assertFalse(proofkin.rendererLocked());

        vm.prank(owner);
        proofkin.lockRenderer();
        assertTrue(proofkin.rendererLocked());

        StubRenderer stub = new StubRenderer();
        vm.expectRevert(Proofkin.RendererLocked.selector);
        vm.prank(owner);
        proofkin.setRenderer(address(stub));
        assertEq(proofkin.renderer(), address(renderer), "unchanged");

        vm.prank(owner);
        proofkin.lockRenderer(); // locking again is harmless
        assertTrue(proofkin.rendererLocked());
    }

    function test_aLockedRendererStillServesTokens() public {
        _mintAs(alice, _solution("SORT8"));
        vm.prank(owner);
        proofkin.lockRenderer();
        assertTrue(LibString.startsWith(proofkin.tokenURI(1), JSON_PREFIX));
    }

    // ------------------------------------------------------------- withdraw

    function test_withdrawSendsTheWholeBalanceToTheOwner() public {
        _mintAs(alice, _solution("SORT8"));
        _mintAs(alice, _solution("QUORUM7"));
        _mintAs(bob, _solution("MEDIAN5"));
        assertEq(address(proofkin).balance, 3 * MINT_PRICE);

        vm.prank(owner);
        proofkin.withdraw();
        assertEq(owner.balance, 3 * MINT_PRICE);
        assertEq(address(proofkin).balance, 0);
    }

    function test_withdrawIsOwnerOnly() public {
        _mintAs(alice, _solution("SORT8"));

        vm.expectRevert(Ownable.Unauthorized.selector);
        vm.prank(alice);
        proofkin.withdraw();
        assertEq(address(proofkin).balance, MINT_PRICE);
    }

    function test_withdrawingAnEmptyBalanceIsHarmless() public {
        vm.prank(owner);
        proofkin.withdraw();
        assertEq(owner.balance, 0);
    }

    function test_theNewOwnerWithdrawsAfterATransfer() public {
        _mintAs(alice, _solution("SORT8"));

        vm.prank(owner);
        proofkin.transferOwnership(bob);
        assertEq(proofkin.owner(), bob);

        vm.expectRevert(Ownable.Unauthorized.selector);
        vm.prank(owner);
        proofkin.withdraw();

        vm.prank(bob);
        proofkin.withdraw();
        assertEq(bob.balance, MINT_PRICE);
    }

    /// The one external call in the contract: re-entering `withdraw` while being paid must not pay twice.
    function test_aReentrantOwnerIsPaidExactlyOnce() public {
        _mintAs(alice, _solution("SORT8"));
        _mintAs(alice, _solution("QUORUM7"));

        ReentrantOwner attacker = new ReentrantOwner(proofkin);
        vm.prank(owner);
        proofkin.transferOwnership(address(attacker));

        attacker.withdraw();
        assertEq(attacker.received(), 2 * MINT_PRICE);
        assertEq(address(attacker).balance, 2 * MINT_PRICE);
        assertEq(address(proofkin).balance, 0);
    }

    function test_aFailedWithdrawKeepsTheFunds() public {
        _mintAs(alice, _solution("SORT8"));

        RejectingOwner rejecting = new RejectingOwner();
        vm.prank(owner);
        proofkin.transferOwnership(address(rejecting));

        vm.expectRevert(SafeTransferLib.ETHTransferFailed.selector);
        rejecting.withdraw(proofkin);
        assertEq(address(proofkin).balance, MINT_PRICE);
    }

    // ----------------------------------------------- ETH only comes in through reveal

    function test_theContractTakesNoStrayEther() public {
        (bool ok,) = address(proofkin).call{value: 1 wei}("");
        assertFalse(ok, "no receive or fallback");

        deal(alice, 1 ether);
        vm.prank(alice);
        (ok,) =
            address(proofkin).call{value: 1 wei}(abi.encodeCall(proofkin.commit, (keccak256("x"))));
        assertFalse(ok, "commit is not payable");
        assertEq(address(proofkin).balance, 0);
    }

    // ---------------------------------------------------------------- ERC721

    function test_tokensTransferLikeAnyERC721() public {
        _mintAs(alice, _solution("SORT8"));
        vm.prank(alice);
        proofkin.transferFrom(alice, bob, 1);
        assertEq(proofkin.ownerOf(1), bob);
        assertEq(proofkin.balanceOf(alice), 0);
        assertEq(proofkin.balanceOf(bob), 1);
    }

    function test_supportedInterfaces() public view {
        assertTrue(proofkin.supportsInterface(0x01ffc9a7), "ERC165");
        assertTrue(proofkin.supportsInterface(0x80ac58cd), "ERC721");
        assertTrue(proofkin.supportsInterface(0x5b5e139f), "ERC721Metadata");
        assertFalse(proofkin.supportsInterface(0xffffffff));
    }

    // ------------------------------------------------------ tokenURI, real renderer

    function _json(string memory uri) private pure returns (string memory) {
        assertTrue(LibString.startsWith(uri, JSON_PREFIX), "JSON data URI");
        return string(Base64.decode(LibString.slice(uri, bytes(JSON_PREFIX).length)));
    }

    function _image(string memory json) private pure returns (string memory) {
        string memory uri = vm.parseJsonString(json, ".image");
        assertTrue(LibString.startsWith(uri, SVG_PREFIX), "SVG data URI");
        return string(Base64.decode(LibString.slice(uri, bytes(SVG_PREFIX).length)));
    }

    function _text(string memory json, uint256 i) private pure returns (string memory) {
        return vm.parseJsonString(json, string.concat(".attributes[", vm.toString(i), "].value"));
    }

    function _number(string memory json, uint256 i) private pure returns (uint256) {
        return vm.parseJsonUint(json, string.concat(".attributes[", vm.toString(i), "].value"));
    }

    // trait positions, as in contracts/test/TokenURI.t.sol
    uint256 constant PUZZLE = 0;
    uint256 constant NODES = 1;
    uint256 constant DEPTH = 2;
    uint256 constant RANK = 3;
    uint256 constant FIRST_SOLVER = 4;
    uint256 constant RECORD_SETTER = 5;
    uint256 constant OPTIMAL = 6;
    uint256 constant FAMILY = 7;

    function test_tokenURIOfAMintedToken() public {
        _mintAs(alice, _solution("SORT8"));
        string memory json = _json(proofkin.tokenURI(1));

        assertEq(vm.parseJsonString(json, ".name"), "Proofkin #1");
        assertEq(_text(json, PUZZLE), "SORT8");
        assertEq(_number(json, NODES), 46);
        assertEq(_number(json, DEPTH), 6, "depth recorded at mint");
        assertEq(_number(json, RANK), 1);
        assertEq(_text(json, FIRST_SOLVER), "Yes");
        assertEq(_text(json, RECORD_SETTER), "Yes");
        assertEq(_text(json, OPTIMAL), "Yes", "46 is the best SORT8 so far");
        assertEq(_text(json, FAMILY), "Compare");
        assertTrue(
            LibString.contains(_image(json), GOLD_RING_MARK), "optimal tokens wear the gold ring"
        );
    }

    /// Optimal is live. A smaller solution takes it from the token that held it; equal size shares it.
    function test_optimalMovesWhenASmallerSolutionIsMinted() public {
        bytes memory base = _solution("QUORUM7"); // 17 nodes
        _mintAs(alice, Variants.pad(base, 2)); // token 1: 19 nodes
        assertEq(_text(_json(proofkin.tokenURI(1)), OPTIMAL), "Yes");

        _mintAs(alice, base); // token 2: 17 nodes, a new record
        string memory first = _json(proofkin.tokenURI(1));
        string memory second = _json(proofkin.tokenURI(2));
        assertEq(_text(first, OPTIMAL), "No", "no longer the smallest");
        assertEq(_text(first, RECORD_SETTER), "Yes", "but it did set a record when minted");
        assertFalse(LibString.contains(_image(first), GOLD_RING_MARK));
        assertEq(_text(second, OPTIMAL), "Yes");
        assertTrue(LibString.contains(_image(second), GOLD_RING_MARK));

        _mintAs(alice, Variants.swap(base, 1)); // token 3: 17 nodes, ties it
        string memory third = _json(proofkin.tokenURI(3));
        assertEq(_text(third, OPTIMAL), "Yes", "equal to the best");
        assertEq(_text(third, RECORD_SETTER), "No", "but it set no record");
        assertEq(_text(_json(proofkin.tokenURI(2)), OPTIMAL), "Yes");
        assertEq(_text(_json(proofkin.tokenURI(3)), FIRST_SOLVER), "No");
    }

    function test_tokenURIOfAMissingTokenReverts() public {
        vm.expectRevert(ERC721.TokenDoesNotExist.selector);
        proofkin.tokenURI(1);

        _mintAs(alice, _solution("SORT8"));
        vm.expectRevert(ERC721.TokenDoesNotExist.selector);
        proofkin.tokenURI(2);
    }

    function test_tokenURIForwardsTheRenderersAnswerUnchanged() public {
        _mintAs(alice, _solution("KNAPSACK3"));
        vm.prank(address(proofkin));
        assertEq(renderer.tokenURI(1), proofkin.tokenURI(1));
    }

    function test_tokenURIGasForTheLargestFixtureIsWithinBudget() public {
        _mintAs(alice, _solution("SORT8")); // 46 nodes, 8 outputs: the heaviest fixture to draw
        uint256 before = gasleft();
        proofkin.tokenURI(1);
        uint256 used = before - gasleft();
        emit log_named_uint("SORT8 tokenURI gas", used);
        assertLt(used, 25_000_000);
    }
}
