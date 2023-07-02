const {
  Account,
  TransferTransaction,
  AggregateTransaction,
  Deadline,
  PlainMessage,
  RepositoryFactoryHttp,
  TransactionService,
  NamespaceId,
  Mosaic,
  UInt64,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey_w = config.get("private1.workaddress.privatekey");
const rawprivatekey_1 = config.get("private1.address1.privatekey");
const rawprivatekey_2 = config.get("private1.address2.privatekey");
const rawprivatekey_3 = config.get("private1.address3.privatekey");
const rawprivatekey_4 = config.get("private1.address4.privatekey");
const rawprivatekey_5 = config.get("private1.address5.privatekey");
const rawprivatekey_6 = config.get("private1.address6.privatekey");
const minfeemultiplier = config.get("private1.minfeemultiplier");

//送信するMosaicのNamespace
const namespace = config.get("private1.workaddress.namespace");

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

  //送信元のアカウント(workaddress)をセット
  const account_w = Account.createFromPrivateKey(rawprivatekey_w, networkType);

  //アカウント1-6をセット
  const account_1 = Account.createFromPrivateKey(rawprivatekey_1, networkType);
  const account_2 = Account.createFromPrivateKey(rawprivatekey_2, networkType);
  const account_3 = Account.createFromPrivateKey(rawprivatekey_3, networkType);
  const account_4 = Account.createFromPrivateKey(rawprivatekey_4, networkType);
  const account_5 = Account.createFromPrivateKey(rawprivatekey_5, networkType);
  const account_6 = Account.createFromPrivateKey(rawprivatekey_6, networkType);

  const namespaceId = new NamespaceId(namespace);
  const mosaic = new Mosaic(namespaceId, UInt64.fromUint(sendmosaicamount));

  //トランザクションを作成するための内容を作る
  const transferTransaction1 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account_1.address, //送信先アドレス1
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx1"), //メッセージ
    networkType
  );

  //トランザクションを作成するための内容を作る
  const transferTransaction2 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account_2.address, //送信先アドレス
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx2"), //メッセージ
    networkType
  );

  //トランザクションを作成するための内容を作る
  const transferTransaction3 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account_3.address, //送信先アドレス
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx3"), //メッセージ
    networkType
  );

  //トランザクションを作成するための内容を作る
  const transferTransaction4 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account_4.address, //送信先アドレス
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx4"), //メッセージ
    networkType
  );

  //トランザクションを作成するための内容を作る
  const transferTransaction5 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account_5.address, //送信先アドレス
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx5"), //メッセージ
    networkType
  );

  //トランザクションを作成するための内容を作る
  const transferTransaction6 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account_6.address, //送信先アドレス
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx6"), //メッセージ
    networkType
  );

  // トランザクションを纏め、AggregateTransactionを作成する。
  // (送信元が同じアドレスの処理なのでCompleteを使用)
  const aggregteTransaction = AggregateTransaction.createComplete(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間),
    [
      transferTransaction1.toAggregate(account_w.publicAccount),
      transferTransaction2.toAggregate(account_w.publicAccount),
      transferTransaction3.toAggregate(account_w.publicAccount),
      transferTransaction4.toAggregate(account_w.publicAccount),
      transferTransaction5.toAggregate(account_w.publicAccount),
      transferTransaction6.toAggregate(account_w.publicAccount),
    ],
    networkType,
    []
  ).setMaxFeeForAggregate(minfeemultiplier, 0);

  //作成したトランザクションに署名する
  const signedTransaction = account_w.sign(aggregteTransaction, ghash);

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
    listener.close();
    return tx;
  } catch (e) {
    listener.close();
    e.code ? console.log("Failed TransactionStatusError", e.code) : console.log("Error: ", e);
    throw new Error(e);
  }
})();
