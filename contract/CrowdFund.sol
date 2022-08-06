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
        require(_goal > 0, "not valid goal");
        require(_endAt > 0, "not valid ending time");
        uint index = campaignsLength;
        campaignsLength++;
        // only required struct values are set
        Campaign storage newCampaigns = campaigns[index];
        newCampaigns.creator = payable(msg.sender);
        newCampaigns.organization = _organization;
        newCampaigns.description = _description;
        newCampaigns.image = _image;
        newCampaigns.endAt = block.timestamp + _endAt;
        newCampaigns.goal = _goal;
        emit Launch(index, msg.sender, _goal, block.timestamp, _endAt);
    }

    // get campaign
    function readCampaign(uint256 _index)
        public
        view
        returns (Campaign memory)
    {
        return (campaigns[_index]);
    }

    // donate to campaign
    function donate(uint _index, uint _amount)
        external
        payable
        nonReentrant
        onlyNotAdmin
        onlyNotBanned(_index)
        onlyNotEnded(_index)
    {
        Campaign storage campaign = campaigns[_index];
        require(block.timestamp < campaign.endAt, "over");
        require(campaign.creator != msg.sender, "creator can't donate");
        require(_amount >= 1 ether, "donation too low");
        // fund stored in contract
        require(
            IERC20Token(cUsdTokenAddress).transferFrom(
                msg.sender,
                address(this),
                _amount
            ),
            "Transfer failed."
        );
        campaign.pledged += _amount;
        campaign.donationsCount++;
        donatedAmount[_index][msg.sender] += _amount;
        emit Donate(_index, msg.sender, _amount);
    }

    // end campaign
    function endCampaign(uint _index)
        external
        payable
        nonReentrant
        onlyNotAdmin
        onlyNotBanned(_index)
        onlyNotEnded(_index)
        onlyCreator(_index)
    {
        Campaign storage campaign = campaigns[_index];
        require(block.timestamp >= campaign.endAt, "not over");
        campaign.ended = true;
        // success is true only if goal is reached or exceeded
        if (campaign.pledged >= campaign.goal) {
            campaign.success = true;
            // pledged amount taken out by creator
            require(
                IERC20Token(cUsdTokenAddress).transfer(
                    msg.sender,
                    campaign.pledged
                ),
                "Transfer failed."
            );
        } else {
            campaign.success = false;
        }
        emit End(_index, msg.sender, campaign.pledged, campaign.success);
    }

    // withdraw donation if campaign is not a success
    function refund(uint _index) external payable nonReentrant onlyNotAdmin {
        require(campaigns[_index].ended, "not ended");
        require(!campaigns[_index].success, "is successful");
        require(donatedAmount[_index][msg.sender] > 0, "Insufficient balance");
        uint withdrawAmount = donatedAmount[_index][msg.sender];
        donatedAmount[_index][msg.sender] = 0;
        require(
            IERC20Token(cUsdTokenAddress).transfer(msg.sender, withdrawAmount),
            "Transfer failed."
        );
        emit Refund(_index, msg.sender, withdrawAmount);
    }

    // ban illegal campaign
    function banCampaign(uint _index)
        public
        onlyOwner
        onlyNotBanned(_index)
        onlyNotEnded(_index)
    {
        banned[_index] = true;
        campaigns[_index].ended = true;
    }

    // deployer end campaign
    function deployerEndCampaign(uint _index)
        public
        payable
        nonReentrant
        onlyNotBanned(_index)
        onlyNotEnded(_index)
        onlyOwner
    {
        Campaign storage campaign = campaigns[_index];
        require(block.timestamp >= campaign.endAt, "not over");
        campaign.ended = true;
        // success is true only if goal is reached or exceeded
        if (campaign.pledged >= campaign.goal) {
            campaign.success = true;
            // pledged transferred to creator
            require(
                IERC20Token(cUsdTokenAddress).transfer(
                    campaign.creator,
                    campaign.pledged
                ),
                "Transfer failed."
            );
        } else {
            campaign.success = false;
        }
        // deployer is ender
        emit End(_index, msg.sender, campaign.pledged, campaign.success);
    }

    function getCampaignsLength() public view returns (uint256) {
        return (campaignsLength);
    }

    function getDonation(uint _index) public view returns (uint256) {
        return (donatedAmount[_index][msg.sender]);
    }
}
