const {
  Account,
  Deadline,
  MosaicId,
  TransactionService,
  RepositoryFactoryHttp,
  MosaicGlobalRestrictionTransaction,
  KeyGenerator,
  UInt64,
  MosaicRestrictionType,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey = config.get("private1.address1.privatekey");
const minfeemultiplier = config.get("private1.minfeemultiplier");

//紐づけるNamespace名とmosaicID
const mosaicId = config.get("private1.address1.mosaicId");

//Mosaic制限キー
const mosaicRestrictionKey = "mosaiccheck".toLocaleUpperCase();

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

  const account = Account.createFromPrivateKey(rawprivatekey, networkType);

  // 特定のMosaicに対して指定したタグ(mosaicRestrictionKey)を持っていないと送信できないトランザクションの作成
  // mosaicRestrictionKey = 1 の時にMosaicを動かす権利があるように指定
  const restrictionTransaction = MosaicGlobalRestrictionTransaction.create(
    Deadline.create(epoch),
    new MosaicId(mosaicId),
    KeyGenerator.generateUInt64Key(mosaicRestrictionKey),
    UInt64.fromUint(0), // 初回の設定のため、0にする
    MosaicRestrictionType.NONE, // 初回の設定のため、NONEにする
    UInt64.fromUint(1), // 値が1であるとき
    MosaicRestrictionType.EQ, // 上の値であるとき
    networkType,
    undefined
  ).setMaxFee(minfeemultiplier);

  const signedTransaction = account.sign(restrictionTransaction, ghash);

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
