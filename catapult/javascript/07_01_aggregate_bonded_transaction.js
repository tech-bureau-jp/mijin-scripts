const {
  Account,
  TransactionHttp,
  TransactionService,
  TransferTransaction,
  AggregateTransaction,
  HashLockTransaction,
  UInt64,
  Deadline,
  PlainMessage,
  RepositoryFactoryHttp,
  NamespaceId,
  Mosaic,
} = require("@tech-bureau/symbol-sdk");
const { ChronoUnit } = require("@js-joda/core");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey1 = config.get("private1.address1.privatekey");
const rawprivatekey2 = config.get("private1.address2.privatekey");
const rawprivatekey3 = config.get("private1.address3.privatekey");

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

  //手数料の取得
  const tfee = await firstValueFrom(repo.createNetworkRepository().getTransactionFees());

  console.log("network", networkType);
  console.log("GenerationHash", ghash);
  console.log("Fee", tfee);

  const epoch = await firstValueFrom(repo.getEpochAdjustment());
  const currency = await firstValueFrom(repo.getCurrencies());

  //アカウント1をセット
  const account1 = Account.createFromPrivateKey(rawprivatekey1, networkType);
  const account2 = Account.createFromPrivateKey(rawprivatekey2, networkType);
  const account3 = Account.createFromPrivateKey(rawprivatekey3, networkType);

  const namespaceId = new NamespaceId(namespace);
  const mosaic = new Mosaic(namespaceId, UInt64.fromUint(sendmosaicamount));

  //トランザクションを作成するための内容を作る
  const transferTransaction1 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account3.address, //送信先アドレス
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx1"), //メッセージ
    networkType
  );

  //トランザクションを作成するための内容を作る
  const transferTransaction2 = TransferTransaction.create(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間)
    account3.address, //送信先アドレス
    [mosaic], //送信するモザイク
    PlainMessage.create("TEST MIJIN tx2"), //メッセージ
    networkType
  );

  // トランザクションを纏め、AggregateTransactionを作成する。
  // (送信元が複数アドレスの処理なのでBondedを使用)
  const aggregteTransaction = AggregateTransaction.createBonded(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間),
    [
      transferTransaction1.toAggregate(account1.publicAccount),
      transferTransaction2.toAggregate(account2.publicAccount),
    ],
    networkType,
    []
  ).setMaxFeeForAggregate(minfeemultiplier, 1);

  console.log(aggregteTransaction.maxFee);

  //作成したトランザクションに署名する
  const signedTransaction = account1.sign(aggregteTransaction, ghash);

  //この中にトランザクションIDが入ってる
  console.log("------------------- signedTransaction ------------------------");
  console.log(signedTransaction);

  //トランザクションをロックするトランザクションを作る
  const hashLockTransaction = HashLockTransaction.create(
    Deadline.create(epoch, 1, ChronoUnit.HOURS), //1時間
    currency.currency.createRelative(tfee.medianFeeMultiplier > 0 ? 10 : 0), // 10cat.carrency必要
    UInt64.fromUint(1000), // 1000block内で
    signedTransaction,
    networkType
  ).setMaxFee(minfeemultiplier);

  //署名する
  const signedHashLockTransaction = account1.sign(hashLockTransaction, ghash);

  console.log("------------------- hashRockTransaction ------------------------");
  console.log(hashLockTransaction);

  console.log("------------------- sendTransaction ------------------------");

  // const repo = new RepositoryFactoryHttp(url);
  const listener = repo.createListener();
  const transactionService = new TransactionService(repo.createTransactionRepository(), repo.createReceiptRepository());

  // トランザクションを送信する
  try {
    // websocketをopenする
    await listener.open();
    // 一旦ハッシュロックトランザクションを先に送る
    const hashLockSend = await firstValueFrom(transactionService.announce(signedHashLockTransaction, listener));
    // その次にAggregateBondedを送る
    const tx = await firstValueFrom(transactionService.announceAggregateBonded(signedTransaction, listener));
    console.log("------------------- Success --------------------------------");
    console.log("Success: Transaction", tx);
    console.log("Next Command: node ./07_02_aggregate_bonded_transaction_cosign address2", tx.transactionInfo.hash);
    console.log("------------------------------------------------------------");
    listener.close();
    return tx;
  } catch (e) {
    listener.close();
    e.code ? console.log("Failed TransactionStatusError", e.code) : console.log("Error: ", e);
    throw new Error(e);
  }
})();
