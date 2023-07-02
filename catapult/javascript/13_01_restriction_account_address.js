const {
  Account,
  Deadline,
  TransactionService,
  RepositoryFactoryHttp,
  AccountRestrictionTransaction,
  AddressRestrictionFlag,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey_w = config.get("private1.workaddress.privatekey");
const rawprivatekey4 = config.get("private1.address4.privatekey");
const minfeemultiplier = config.get("private1.minfeemultiplier");

//紐づけるNamespace名とmosaicID
const namespace = config.get("private1.workaddress.namespace");
const mosaicId = config.get("private1.workaddress.mosaicId");

(async () => {
  // 一回mijinにアクセスして、Cookieを取得する
  const cookieJar = new toughCookie.CookieJar();
  const fetchCookieJar = fetchCookie(fetch, cookieJar);
  await fetchCookieJar(url);
  const cookie = await cookieJar.getCookieString(url);

  // Websocketオプション Cookieを設定する
  const websocketOptions = {
    headers: { cookie: cookie },
  };

  const repo = new RepositoryFactoryHttp(url, {
    fetchApi: fetchCookieJar,
    websocketOptions: websocketOptions,
  });

  //Networktypeをcatapultから取得
  const networkType = await firstValueFrom(repo.getNetworkType());
  //GenerationHashをcatapultから取得
  const ghash = await firstValueFrom(repo.getGenerationHash());

  console.log("network", networkType);
  console.log("GenerationHash", ghash);

  const epoch = await firstValueFrom(repo.getEpochAdjustment());

  //送信元のアカウントをセット
  const account_w = Account.createFromPrivateKey(rawprivatekey_w, networkType);
  const account4 = Account.createFromPrivateKey(rawprivatekey4, networkType);

  // 特定のアドレスからのみ受信を許可するトランザクションの作成
  const restrictionTransaction = AccountRestrictionTransaction.createAddressRestrictionModificationTransaction(
    Deadline.create(epoch),
    AddressRestrictionFlag.AllowIncomingAddress,
    [account_w.address],
    [],
    networkType
  ).setMaxFee(minfeemultiplier);

  //作成したトランザクションに署名する
  const signedTransaction = account4.sign(restrictionTransaction, ghash);

  //この中にトランザクションIDが入ってる
  console.log("------------------- signedTransaction ------------------------");
  console.log(signedTransaction);
  console.log("------------------- sendTransaction ------------------------");

  //websocketを作成する
  const listener = repo.createListener();
  const transactionService = new TransactionService(repo.createTransactionRepository(), repo.createReceiptRepository());

  // トランザクションを送信する
  try {
    // websocketをopenする
    await listener.open();
    const tx = await firstValueFrom(transactionService.announce(signedTransaction, listener));
    console.log("------------------- Success --------------------------------");
    console.log("Success: Transaction", tx);
    console.log("------------------------------------------------------------");
    listener.close();
    return tx;
  } catch (e) {
    listener.close();
    e.code ? console.log("Failed TransactionStatusError", e.code) : console.log("Error: ", e);
    throw new Error(e);
  }
})();
