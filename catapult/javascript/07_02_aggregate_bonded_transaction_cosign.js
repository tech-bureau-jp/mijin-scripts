const {
  Account,
  TransactionHttp,
  CosignatureTransaction,
  RepositoryFactoryHttp,
  TransactionGroup,
} = require("@tech-bureau/symbol-sdk");
const config = require("config");
const { firstValueFrom } = require("rxjs");

const option = process.argv[2];

if (!option.match(/address[1-9]/)) {
  console.error("option error");
  return;
}

const url = config.get("private1.url");
const rawprivatekey = config.get(`private1.${option}.privatekey`);

const txId = process.argv[3];

(async () => {
  const repo = new RepositoryFactoryHttp(url);

  //Networktypeをcatapultから取得
  const networkType = await firstValueFrom(repo.getNetworkType());
  //GenerationHashをcatapultから取得
  const ghash = await firstValueFrom(repo.getGenerationHash());

  console.log("network", networkType);
  console.log("GenerationHash", ghash);

  //アカウントをセット
  const account = Account.createFromPrivateKey(rawprivatekey, networkType);

  //トランザクションを開く
  const transactionHttp = new TransactionHttp(url);

  //トランザクションを検索
  const transaction = await firstValueFrom(
    repo.createTransactionRepository().getTransaction(txId, TransactionGroup.Partial)
  );

  console.log(transaction);

  //トランザクションに署名
  const signdTransaction = account.signCosignatureTransaction(CosignatureTransaction.create(transaction));
  await firstValueFrom(transactionHttp.announceAggregateBondedCosignature(signdTransaction));
})();
