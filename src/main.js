import Web3 from "web3";
import { newKitFromWeb3 } from "@celo/contractkit";
import BigNumber from "bignumber.js";
import crowdfundAbi from "../contract/crowdfund.abi.json";
import erc20Abi from "../contract/erc20.abi.json";

const ERC20_DECIMALS = 18;
const CPContractAddress = "0xB290C533bef6b25CF8c652CB19FCBdDE7bb18820";
const cUSDContractAddress = "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1";

let kit;
let contract;
let campaigns = [];
const day = 86400;
let owner;

const connectCeloWallet = async function () {
  if (window.celo) {
    notification("⚠️ Please approve this DApp to use it.");
    try {
      await window.celo.enable();
      notificationOff();

      const web3 = new Web3(window.celo);
      kit = newKitFromWeb3(web3);

      const accounts = await kit.web3.eth.getAccounts();
      kit.defaultAccount = accounts[0];

      contract = new kit.web3.eth.Contract(crowdfundAbi, CPContractAddress);
    } catch (error) {
      notification(`⚠️ ${error}.`);
    }
  } else {
    notification("⚠️ Please install the CeloExtensionWallet.");
  }
};

async function approve(_price) {
  const cUSDContract = new kit.web3.eth.Contract(erc20Abi, cUSDContractAddress);

  const result = await cUSDContract.methods
    .approve(CPContractAddress, _price)
    .send({ from: kit.defaultAccount });
  return result;
}

const getBalance = async function () {
  const totalBalance = await kit.getTotalBalance(kit.defaultAccount);
  const cUSDBalance = totalBalance.cUSD.shiftedBy(-ERC20_DECIMALS).toFixed(2);
  document.querySelector("#balance").textContent = cUSDBalance;
};

const getOwner = async function () {
  let _owner = await contract.methods.owner().call();
  owner = _owner;
};

const getCampaigns = async function () {
  const _productsLength = await contract.methods.getCampaignsLength().call();
  const _campaigns = [];
  for (let i = 0; i < _productsLength; i++) {
    let _campaign = new Promise(async (resolve, reject) => {
      let p = await contract.methods.readCampaign(i).call();
      resolve({
        index: i,
        creator: p[0],
        image: p[1],
        organization: p[2],
        description: p[3],
        goal: new BigNumber(p[4]),
        pledged: new BigNumber(p[5]),
        donationsCount: Number(p[6]),
        endAt: p[7],
        ended: p[8],
        success: Number(p[9]),
      });
    });
    _campaigns.push(_campaign);
  }
  campaigns = await Promise.all(_campaigns);
  renderCampaigns();
};

const endCampaign = async function (index, banned) {
  if (banned) {
    notification(`⚠️ ${campaigns[index].organization} is banned.`);
    return;
  }
  // converts endAt to milliseconds
  if (new Date() > campaigns[index].endAt * 1000) {
    notification(
      `⌛ Ending campaign for "${campaigns[index].organization}"...`
    );
    try {
      if (owner === kit.defaultAccount) {
        await contract.methods
          .deployerEndCampaign(index)
          .send({ from: kit.defaultAccount });
      } else {
        await contract.methods
          .endCampaign(index)
          .send({ from: kit.defaultAccount });
      }
      notification(
        `🎉 You have successfully ended campaign for "${campaigns[index].organization}".`
      );
      getCampaigns();
      getBalance();
    } catch (error) {
      notification(`⚠️ ${error}.`);
    }
  } else {
    notification(`⚠️ ${campaigns[index].organization} still open`);
  }
};

const getRefund = async function (index) {
  notification("⌛ Verifying refund amount...");
  const donationAmount = new BigNumber(
    await contract.methods.getDonation(index).call()
  );

  // if donation amount is zero, refund process will stop
  if (donationAmount.comparedTo(new BigNumber(0)) === 0) {
    notification(`⚠️ No balance to be refunded.`);
    return;
  }
  notification(`⌛ Awaiting refund for "${campaigns[index].organization}"...`);
  try {
    const result = await contract.methods
      .refund(index)
      .send({ from: kit.defaultAccount });
    notification(
      `🎉 You were successfully refunded by "${campaigns[index].organization}".`
    );
    getCampaigns();
    getBalance();
  } catch (error) {
    notification(`⚠️ ${error}.`);
  }
};

const donateCampaign = async function (index, banned) {
  notification("⌛ Waiting for donation approval...");
  if (banned) {
    notification(`⚠️ ${campaigns[index].organization} is banned.`);
    return;
  }
  const donationAmount = new BigNumber(
    document.getElementById(`donationAmount-${index}`).value
  )
    .shiftedBy(ERC20_DECIMALS)
    .toString();
  try {
    await approve(donationAmount);
  } catch (error) {
    notification(`⚠️ ${error}.`);
  }
  notification(
    `⌛ Awaiting donation for "${campaigns[index].organization}"...`
  );
  try {
    const result = await contract.methods
      .donate(index, donationAmount)
      .send({ from: kit.defaultAccount });
    notification(
      `🎉 You successfully donated to "${campaigns[index].organization}".`
    );
    getCampaigns();
    getBalance();
  } catch (error) {
    notification(`⚠️ ${error}.`);
  }
};

function renderCampaigns() {
  document.getElementById("campaigns").innerHTML = "";
  campaigns.forEach((_campaign) => {
    const newDiv = document.createElement("div");
    newDiv.className = "col-md-4";
    newDiv.innerHTML = productTemplate(_campaign);
    document.getElementById("campaigns").appendChild(newDiv);
  });
}

function productTemplate(_campaign) {
  const pledged = _campaign.pledged.shiftedBy(-ERC20_DECIMALS);
  const goal = _campaign.goal.shiftedBy(-ERC20_DECIMALS);
  return `
    <div class="card mb-4 shadow-lg">
      <img class="card-img-top" src="${_campaign.image}" alt="...">
      <div class="position-absolute top-0 end-0 bg-warning mt-4 px-2 py-1 rounded-start">
      Campaign ends at ${new Date(_campaign.endAt * 1000).toLocaleString()}
    </div>
      <div class="card-body text-left p-4 position-relative">
        <div class="translate-middle-y position-absolute top-0">
        ${identiconTemplate(_campaign.creator)}
        </div>
        <h2 class="card-title fs-4 fw-bold mt-2">${_campaign.organization}</h2>
        <p class="card-text mb-4" style="min-height: 82px">
          ${_campaign.description}             
        </p>
        <h4 class="fs-6 card-text"> ${pledged}/${goal} CUSD collected out of ${
    _campaign.donationsCount
  } donations</h4>
        <div class="progress mb-3">
        <div class="progress-bar" role="progressbar" style="width: ${
          (pledged / goal) * 100
        }%;" aria-valuenow=${
    (pledged / goal) * 100
  } aria-valuemin="0" aria-valuemax="100"> ${(pledged / goal) * 100}%</div>
        </div>
        <div class="d-grid gap-2">
        ${getAction(_campaign)}
        </div>
      </div>
    </div>
  `;
}

function getAction(_campaign) {
  const time = new Date();
  if (owner == kit.defaultAccount) {
    if (!_campaign.ended && time < _campaign.endAt * 1000) {
      return `<a class="btn btn-lg btn-outline-danger banBtn fs-6 p-3" id=${_campaign.index}>
      Ban campaign
    </a>`;
    } else if (time > _campaign.endAt * 1000 && !_campaign.ended) {
      return `<a class="btn btn-lg btn-outline-dark endBtn fs-6 p-3" id=${_campaign.index}>
      End Campaign
    </a>`;
    } else {
      return "";
    }
  } else if (_campaign.creator === kit.defaultAccount) {
    if (time > _campaign.endAt * 1000 && !_campaign.ended) {
      return `<a class="btn btn-lg btn-outline-dark endBtn fs-6 p-3" id=${_campaign.index}>
      End Campaign
    </a>`;
    } else {
      return "";
    }
  } else {
    if (_campaign.ended && !_campaign.success) {
      return `<a class="btn btn-lg btn-outline-dark refundBtn fs-6 p-3" id=${_campaign.index}>
      Refund
    </a>`;
    } else if (new Date() < _campaign.endAt * 1000) {
      return `<div class="form-floating">
    <input type="text" class="form-control" id="donationAmount-${_campaign.index}" placeholder="Amount">
    <label for="donationAmount-${_campaign.index}">Donate</label>
    </div>
      <a class="btn btn-lg btn-outline-dark donateBtn fs-6 p-3" id=${_campaign.index}>
        Donate
      </a>`;
    } else {
      return "";
    }
  }
}

function identiconTemplate(_address) {
  const icon = blockies
    .create({
      seed: _address,
      size: 8,
      scale: 16,
    })
    .toDataURL();

  return `
  <div class="rounded-circle overflow-hidden d-inline-block border border-white border-2 shadow-sm m-0">
    <a href="https://alfajores-blockscout.celo-testnet.org/address/${_address}/transactions"
        target="_blank">
        <img src="${icon}" width="48" alt="${_address}">
    </a>
  </div>
  `;
}

function notification(_text) {
  document.querySelector(".alert").style.display = "block";
  document.querySelector("#notification").textContent = _text;
}

function notificationOff() {
  document.querySelector(".alert").style.display = "none";
}

window.addEventListener("load", async () => {
  notification("⌛ Loading...");
  await connectCeloWallet();
  await getBalance();
  await getOwner();
  await getCampaigns();
  notificationOff();
});

document
  .querySelector("#newCampaignBtn")
  .addEventListener("click", async (e) => {
    if (owner !== kit.defaultAccount) {
      const params = [
        document.getElementById("newCampaignOrganization").value,
        document.getElementById("newCampaignDescription").value,
        document.getElementById("newImgUrl").value,
        new BigNumber(document.getElementById("goal").value)
          .shiftedBy(ERC20_DECIMALS)
          .toString(),
        document.getElementById("endAt").value * day,
      ];
      notification(`⌛ Adding "${params[0]}"...`);
      try {
        const result = await contract.methods
          .createCampaign(...params)
          .send({ from: kit.defaultAccount });
      } catch (error) {
        notification(`⚠️ ${error}.`);
      }
      notification(`🎉 You successfully added "${params[0]}".`);
      getCampaigns();
    } else {
      notification("⚠️ Deployer can't create campaigns");
    }
  });

document.querySelector("#campaigns").addEventListener("click", async (e) => {
  const index = e.target.id;
  const banned = index !== null ? await contract.methods.banned(index).call() : "";
  if (e.target.className.includes("donateBtn")) {
    await donateCampaign(index, banned);
  } else if (e.target.className.includes("refundBtn")) {
    await getRefund(index);
  } else if (e.target.className.includes("endBtn")) {
    await endCampaign(index, banned);
  } else if (e.target.className.includes("banBtn")) {
    try {
      if (banned) {
        notification(`⚠️ ${campaigns[index].organization} is banned.`);
        return;
      }
      const result = await contract.methods
        .banCampaign(index)
        .send({ from: kit.defaultAccount });
      notification(
        `🎉 You have successfully ban the campaign of "${campaigns[index].organization}".`
      );
      getCampaigns();
    } catch (error) {
      notification(`⚠️ ${error}.`);
    }
  } else {
    return;
  }
});
