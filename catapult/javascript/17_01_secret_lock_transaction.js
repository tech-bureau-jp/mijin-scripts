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
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");
const jssha3 = require("js-sha3");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey = config.get("private1.address1.privatekey");
const rawmosaicId = config.get("private1.address1.mosaicId");
const rawsendadress = config.get("private1.address2.address");
const sendaddress = Address.createFromRawAddress(rawsendadress);
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

  const random = Crypto.randomBytes(32);
  const hash = jssha3.sha3_256.create();

  const secret = hash.update(random).hex();
  const proof = random.toString("hex");

  // secretは公開された値であり、トランザクション内で確認できる
  console.log("secret", secret);
  // proofは解除値になるため、交換したい相手に伝えることになる
  console.log("proof", proof);

  //シークレットロックトランザクションを作成するための内容を作る
  const secretLockTransaction = SecretLockTransaction.create(
    Deadline.create(epoch),
    mosaic,
    UInt64.fromUint(1000), // 1000ブロックまで承認されなければ無効
    LockHashAlgorithm.Op_Sha3_256, // secretはSHA3-256で暗号化
    secret,
    sendaddress, //シークレットロックで設定したMosaicの送り先のアドレスを指定
    networkType
  ).setMaxFee(minfeemultiplier);

  //送信元のアカウントをセット
  const account = Account.createFromPrivateKey(rawprivatekey, networkType);

  //作成したトランザクションに署名する
  const signedTransaction = account.sign(secretLockTransaction, ghash);

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
    console.log("Next Command: node ./16_02_secret_proof_transaction", secret, proof);
    console.log("------------------------------------------------------------");
    listener.close();
    return tx;
  } catch (e) {
    listener.close();
    e.code ? console.log("Failed TransactionStatusError", e.code) : console.log("Error: ", e);
    throw new Error(e);
  }
})();
