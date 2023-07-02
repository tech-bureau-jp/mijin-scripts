const {
  Account,
  Deadline,
  MosaicId,
  TransactionService,
  RepositoryFactoryHttp,
  AccountRestrictionTransaction,
  MosaicRestrictionFlag,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey5 = config.get("private1.address5.privatekey");
const minfeemultiplier = config.get("private1.minfeemultiplier");

//紐づけるNamespace名とmosaicID
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

  const account5 = Account.createFromPrivateKey(rawprivatekey5, networkType);

  // 特定のMosaicをブロックするトランザクションの作成
  const restrictionTransaction = AccountRestrictionTransaction.createMosaicRestrictionModificationTransaction(
    Deadline.create(epoch),
    MosaicRestrictionFlag.BlockMosaic,
    [new MosaicId(mosaicId)],
    [],
    networkType
  ).setMaxFee(minfeemultiplier);

  //作成したトランザクションに署名する
  const signedTransaction = account5.sign(restrictionTransaction, ghash);

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
