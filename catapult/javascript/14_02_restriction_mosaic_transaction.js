const {
  Account,
  Address,
  TransferTransaction,
  Deadline,
  PlainMessage,
  RepositoryFactoryHttp,
  TransactionService,
  MosaicId,
  Mosaic,
  UInt64,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey = config.get("private1.workaddress.privatekey");
const rawmosaicId = config.get("private1.workaddress.mosaicId");
const rawsendadress4 = config.get("private1.address5.address");
const sendaddress = Address.createFromRawAddress(rawsendadress4);
const minfeemultiplier = config.get("private1.minfeemultiplier");

// 送信するMosaic数
const sendmosaicamount = 1;

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
  const mosaic = new Mosaic(new MosaicId(rawmosaicId), UInt64.fromUint(sendmosaicamount));

  //トランザクションを作成するための内容を作る
  const transferTransaction = TransferTransaction.create(
    Deadline.create(epoch), // いつまでトランザクションをもたせるか
    sendaddress, //送信先アドレス
    [mosaic], // catの送信数
    PlainMessage.create("TEST MIJIN"), //メッセージ
    networkType
  ).setMaxFee(minfeemultiplier); //最低手数料をつけます

  //送信元のアカウントをセット
  const account = Account.createFromPrivateKey(rawprivatekey, networkType);

  //作成したトランザクションに署名する
  const signedTransaction = account.sign(transferTransaction, ghash);

  console.log("txsize", transferTransaction.size);
  console.log("payload", signedTransaction.payload.length);

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
    // トランザクションを送信する
    const announce = await firstValueFrom(transactionService.announce(signedTransaction, listener));
    console.log("------------------- Success --------------------------------");
    console.log("Success: Transaction", announce);
    console.log("------------------------------------------------------------");
    listener.close();
    return announce;
  } catch (e) {
    listener.close();
    e.code ? console.log("Failed TransactionStatusError", e.code) : console.log("Error: ", e);
    throw new Error(e);
  }
})();
