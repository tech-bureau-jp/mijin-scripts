const {
  Account,
  Deadline,
  RepositoryFactoryHttp,
  TransactionService,
  AggregateTransaction,
  NamespaceMetadataTransaction,
  KeyGenerator,
  Convert,
  MetadataType,
  NamespaceId,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");
const { map } = require("rxjs/operators");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");
const rawprivatekey = config.get("private1.workaddress.privatekey");
const minfeemultiplier = config.get("private1.minfeemultiplier");
//作成するNamespace名
const namespace = config.get("private1.workaddress.namespace");

// 送信するMosaic数
const key = "NamespaceMetaTest";
const value = "NamespaceMetaTest";

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

  const byteKey = KeyGenerator.generateUInt64Key(key);

  const metaHttp = repo.createMetadataRepository();

  const metaDataTransation = await firstValueFrom(
    // 既存のメタデータ情報を検索する
    metaHttp
      .search({
        targetAddress: account.address,
        scopedMetadataKey: byteKey.toHex(),
        sourceAddress: account.address,
        metadataType: MetadataType.Namespace,
      })
      .pipe(
        map((metadatas) => {
          // 既存のメタデータがある場合は更新する
          if (metadatas.data.length > 0) {
            const metadata = metadatas.data[0];
            console.log(metadata);
            const currentValueByte = Convert.utf8ToUint8(metadata.metadataEntry.value);
            const newValueBytes = Convert.utf8ToUint8(value);
            const xoredBytes = Convert.hexToUint8(Convert.xor(currentValueByte, newValueBytes));

            return NamespaceMetadataTransaction.create(
              Deadline.create(epoch),
              account.address,
              byteKey,
              new NamespaceId(namespace), //MosaicIdを指定
              newValueBytes.length - currentValueByte.length,
              xoredBytes,
              networkType
            ).setMaxFee(minfeemultiplier);
          }
          const newValueBytes = Convert.utf8ToUint8(value);
          return NamespaceMetadataTransaction.create(
            Deadline.create(epoch),
            account.address,
            byteKey,
            new NamespaceId(namespace), //MosaicIdを指定
            newValueBytes.length,
            Convert.utf8ToUint8(value),
            networkType
          ).setMaxFee(minfeemultiplier);
        })
      )
  );

  // トランザクションを纏め、AggregateTransactionを作成する。
  // (送信元が同じアドレスの処理なのでCompleteを使用)
  const aggregteTransaction = AggregateTransaction.createComplete(
    Deadline.create(epoch), //いつまでトランザクションをもたせるか(default ２時間),
    [metaDataTransation.toAggregate(account.publicAccount)],
    networkType,
    []
  ).setMaxFeeForAggregate(minfeemultiplier, 0);

  //作成したトランザクションに署名する
  const signedTransaction = account.sign(aggregteTransaction, ghash);

  console.log("txsize", metaDataTransation.size);
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
