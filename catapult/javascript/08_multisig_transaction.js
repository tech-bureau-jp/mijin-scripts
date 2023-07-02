const {
  Account,
  TransactionService,
  TransferTransaction,
  AggregateTransaction,
  HashLockTransaction,
  UInt64,
  Deadline,
  PlainMessage,
  RepositoryFactoryHttp,
  MultisigAccountModificationTransaction,
} = require("@tech-bureau/symbol-sdk");
const { firstValueFrom } = require("rxjs");
const { ChronoUnit } = require("@js-joda/core");
const config = require("config");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey_w = config.get("private1.workaddress.privatekey");
const rawprivatekey1 = config.get("private1.address1.privatekey");
const rawprivatekey2 = config.get("private1.address2.privatekey");
const rawprivatekey3 = config.get("private1.address3.privatekey");

const minfeemultiplier = config.get("private1.minfeemultiplier");

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
  const tfee = await repo.createNetworkRepository().getTransactionFees().toPromise();

  console.log("network", networkType);
  console.log("GenerationHash", ghash);
  console.log("Fee", tfee);

  const epoch = await firstValueFrom(repo.getEpochAdjustment());
  const currency = await firstValueFrom(repo.getCurrencies());

  //アカウント1をセット
  const account_w = Account.createFromPrivateKey(rawprivatekey_w, networkType);
  const account1 = Account.createFromPrivateKey(rawprivatekey1, networkType);
  const account2 = Account.createFromPrivateKey(rawprivatekey2, networkType);
  const account3 = Account.createFromPrivateKey(rawprivatekey3, networkType);

  const multisigAccountModificationTransaction = MultisigAccountModificationTransaction.create(
    Deadline.create(epoch, 23, ChronoUnit.HOURS),
    1, // 1人以上が署名すれば、アナウンスできる
    1, // 1人以上が署名すれば、連署者を削除できる
    [
      account1.address, // 連署者
      account2.address, // 連署者
    ],
    [],
    networkType
  );

  //トランザクションを作成するための内容を作る(ダミー)
  const dummyTransaction = TransferTransaction.create(
    Deadline.create(epoch, 23, ChronoUnit.HOURS), //いつまでトランザクションをもたせるか(default ２時間)
    account3.address, //送信先アドレス
    [currency.currency.createRelative(0)], //catの送信数
    PlainMessage.create("TEST MIJIN dummy"), //メッセージ
    networkType
  );

  // トランザクションを纏め、AggregateTransactionを作成する。
  const aggregteTransaction = AggregateTransaction.createBonded(
    Deadline.create(epoch, 23, ChronoUnit.HOURS), //いつまでトランザクションをもたせるか(default ２時間),
    [
      dummyTransaction.toAggregate(account_w.publicAccount),
      multisigAccountModificationTransaction.toAggregate(account3.publicAccount),
    ],
    networkType,
    []
  ).setMaxFeeForAggregate(minfeemultiplier, 3); //署名者が3人いるため

  console.log(aggregteTransaction.maxFee);

  //作成したトランザクションに署名する
  const signedTransaction = account_w.sign(aggregteTransaction, ghash);

  //この中にトランザクションIDが入ってる
  console.log("------------------- signedTransaction ------------------------");
  console.log(signedTransaction);

  //トランザクションをロックするトランザクションを作る
  const hashLockTransaction = HashLockTransaction.create(
    Deadline.create(epoch, 2, ChronoUnit.HOURS), //2時間
    currency.currency.createRelative(tfee.medianFeeMultiplier > 0 ? 10 : 0), // 手数料がある場合は10cat.carrency必要
    UInt64.fromUint(1000), // 1000block内で
    signedTransaction,
    networkType
  ).setMaxFee(minfeemultiplier);

  //署名する
  const signedHashLockTransaction = account_w.sign(hashLockTransaction, ghash);

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
    console.log("Next Command: node ./07_02_aggregate_bonded_transaction_cosign address1", tx.transactionInfo.hash);
    console.log("Next Command: node ./07_02_aggregate_bonded_transaction_cosign address2", tx.transactionInfo.hash);
    console.log("Next Command: node ./07_02_aggregate_bonded_transaction_cosign address3", tx.transactionInfo.hash);
    console.log("------------------------------------------------------------");
    listener.close();
    return tx;
  } catch (e) {
    listener.close();
    e.code ? console.log("Failed TransactionStatusError", e.code) : console.log("Error: ", e);
    throw new Error(e);
  }
})();
