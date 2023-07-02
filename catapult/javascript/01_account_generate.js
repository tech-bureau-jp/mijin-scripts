const { Account, RepositoryFactoryHttp } = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");
const url = config.get("private1.url");

let accounts = {};

(async () => {
  const repo = new RepositoryFactoryHttp(url);

  //Get Networktype from catapult Networktypeをcatapultから取得
  const networkType = await firstValueFrom(repo.getNetworkType());
  //Get GenerationHash from catapult GenerationHashをcatapultから取得
  const ghash = await firstValueFrom(repo.getGenerationHash());

  console.log("network", networkType);
  console.log("GenerationHash", ghash);

  //送信元アカウントの作成
  const workaccount = Account.generateNewAccount(networkType);
  accounts[`workaddress`] = {
    privatekey: workaccount.privateKey,
    address: workaccount.address.plain(),
    mosaicId: "",
    namespace: "",
  };

  //送信先アカウントの作成
  for (let count = 1; count <= 6; count++) {
    const account = Account.generateNewAccount(networkType);
    accounts[`address${count}`] = {
      privatekey: account.privateKey,
      address: account.address.plain(),
      mosaicId: "",
      namespace: "",
    };
  }

  console.log(JSON.stringify(accounts, null, 2));
})();
