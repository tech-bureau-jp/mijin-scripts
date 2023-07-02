const {
  Account,
  MosaicSupplyChangeTransaction,
  Deadline,
  MosaicDefinitionTransaction,
  MosaicFlags,
  MosaicId,
  MosaicNonce,
  MosaicSupplyChangeAction,
  UInt64,
  AggregateTransaction,
  TransactionService,
  RepositoryFactoryHttp,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey = config.get("private1.address1.privatekey");
const minfeemultiplier = config.get("private1.minfeemultiplier");

//Mosaic発行数
const mosaicSupply = 100;

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
  const account = Account.createFromPrivateKey(rawprivatekey, networkType);

  //Mosaicの作成準備
  const nonce = MosaicNonce.createRandom();

  //Mosaic作成するためのトランザクションを作成
  const mosaicDefinitionTransaction = MosaicDefinitionTransaction.create(
    Deadline.create(epoch),
    nonce,
    MosaicId.createFromNonce(nonce, account.address),
    MosaicFlags.create(true, true, true), // supplyMutable, transferable, restrictable
    0, //可分性
    UInt64.fromUint(0), //無期限のMosaic
    networkType
  );

  //Mosaicの初期供給量を設定する
  const mosaicSupplyChangeTransaction = MosaicSupplyChangeTransaction.create(
    Deadline.create(epoch),
    mosaicDefinitionTransaction.mosaicId,
    MosaicSupplyChangeAction.Increase,
    UInt64.fromUint(mosaicSupply),
    networkType
  );

  //トランザクションを纏める
  const aggregateTransaction = AggregateTransaction.createComplete(
    Deadline.create(epoch),
    [
      mosaicDefinitionTransaction.toAggregate(account.publicAccount),
      mosaicSupplyChangeTransaction.toAggregate(account.publicAccount),
    ],
    networkType,
    []
  ).setMaxFeeForAggregate(minfeemultiplier, 0);

  //作成したトランザクションに署名する
  const signedTransaction = account.sign(aggregateTransaction, ghash);

  //この中にトランザクションIDが入ってる
  console.log("------------------- signedTransaction ------------------------");
  console.log(signedTransaction);
  console.log("------------------- sendTransaction ------------------------");

  //websocketを作成する
  const listener = repo.createListener();
  const transactionService = new TransactionService(repo.createTransactionRepository(), repo.createReceiptRepository());

  try {
    // websocketをopenする
    await listener.open();
    const tx = await firstValueFrom(transactionService.announce(signedTransaction, listener));
    console.log("------------------- Success --------------------------------");
    console.log("Success: Transaction", tx);
    console.log("------------------------------------------------------------");
    console.log("New Mosaic Id", mosaicDefinitionTransaction.mosaicId.toHex());
    console.log("------------------------------------------------------------");
    listener.close();
    return tx;
  } catch (e) {
    listener.close();
    e.code ? console.log("Failed TransactionStatusError", e.code) : console.log("Error: ", e);
    throw new Error(e);
  }
})();
