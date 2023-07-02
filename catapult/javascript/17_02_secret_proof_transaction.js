const {
  Account,
  UInt64,
  Deadline,
  Address,
  Mosaic,
  MosaicId,
  Crypto,
  RepositoryFactoryHttp,
  TransactionService,
  SecretLockTransaction,
  LockHashAlgorithm,
  SecretProofTransaction,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey = config.get("private1.workaddress.privatekey");
const rawsendadress = config.get("private1.address2.address");
const sendaddress = Address.createFromRawAddress(rawsendadress);
const minfeemultiplier = config.get("private1.minfeemultiplier");

const secret = process.argv[2];
const proof = process.argv[3];

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

  //シークレットプルーフトランザクションを作成するための内容を作る
  const secretProofTransaction = SecretProofTransaction.create(
    Deadline.create(epoch),
    LockHashAlgorithm.Op_Sha3_256, // secretはSHA3-256で複合化
    secret,
    sendaddress, //シークレットロックで設定したMosaicを送信するアドレスを指定
    proof,
    networkType
  ).setMaxFee(minfeemultiplier);

  //送信元のアカウントをセット
  // proof値さえ知っていれば、誰がトランザクションに署名しても成立することができる
  const account = Account.createFromPrivateKey(rawprivatekey, networkType);

  //作成したトランザクションに署名する
  const signedTransaction = account.sign(secretProofTransaction, ghash);

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
