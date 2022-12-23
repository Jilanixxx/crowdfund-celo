// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20Token {
    function transfer(address, uint256) external returns (bool);

    function approve(address, uint256) external returns (bool);

    function transferFrom(
        address,
        address,
        uint256
    ) external returns (bool);

    function totalSupply() external view returns (uint256);

    function balanceOf(address) external view returns (uint256);

    function allowance(address, address) external view returns (uint256);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
}

contract CrowdFund is ReentrancyGuard, Ownable {
    event Launch(
        uint256 index,
        address indexed creator,
        uint256 goal,
        uint256 startAt,
        uint256 endAt
    );
    event End(
        uint256 index,
        address indexed creator,
        uint256 pledged,
        bool success
    );
    event Donate(uint index, address indexed caller, uint amount);
    event Refund(uint index, address indexed caller, uint amount);

    uint256 private campaignsLength = 0;
    address internal cUsdTokenAddress =
        0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1;

    struct Campaign {
        address payable creator;
        string image;
        string organization;
        string description;
        uint256 goal;
        uint256 pledged;
        uint256 donationsCount;
        uint256 endAt;
        bool ended;
        bool success;
    }

    mapping(uint256 => Campaign) private campaigns;
    mapping(uint => bool) public banned;
    mapping(uint => mapping(address => uint)) private donatedAmount;

    modifier onlyCreator(uint _index) {
        require(campaigns[_index].creator == msg.sender, "not creator");
        _;
    }

    modifier onlyNotEnded(uint256 _index) {
        require(!campaigns[_index].ended, "ended");
        _;
    }

    modifier onlyNotBanned(uint _index) {
        require(!banned[_index], "is banned");
        _;
    }

    modifier onlyNotAdmin() {
        require(owner() != msg.sender, "not authorized");
        _;
    }

    // Create campaign of a crowdfund
    function createCampaign(
        string memory _organization,
        string memory _description,
        string memory _image,
        uint256 _goal,
        uint256 _endAt
    ) public onlyNotAdmin {
        // Validate input parameters
        require(_goal > 0, "not valid goal");
        require(_endAt > now, "not valid ending time");

        uint index = campaignsLength;
        campaignsLength++;

        // Convert end time to seconds since the epoch
