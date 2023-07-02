const { RepositoryFactoryHttp, Order } = require("@tech-bureau/symbol-sdk");
const config = require("config");
const url = config.get("private1.url");

const { firstValueFrom } = require("rxjs");

(async () => {
  const repo = new RepositoryFactoryHttp(url);

  //Networktypeをcatapultから取得
  const networkType = await firstValueFrom(repo.getNetworkType());
  //GenerationHashをcatapultから取得
  const ghash = await firstValueFrom(repo.getGenerationHash());
  //GenerationHashをcatapultから取得
  const epoch = await firstValueFrom(repo.getEpochAdjustment());

  console.log("network", networkType);
  console.log("GenerationHash", ghash);

  try {
    const blockRepo = repo.createBlockRepository();

    const searchCriteria = {
      pageNumber: 1,
      pageSize: 10,
      order: Order.Desc,
    };

    const blockInfo = await firstValueFrom(blockRepo.search(searchCriteria));

    blockInfo.data.map((block) => {
      console.log("-------------------------------------------------");
      console.log("BlockHeight", block.height.compact());
      console.log("Date", new Date(block.timestamp.compact() + epoch * 1000).toString());
      console.log("TotalTranction", block.transactionsCount);
      // console.log('BlockInfo', block)
      console.log("-------------------------------------------------");
    });
  } catch (e) {
    console.error(e);
  }
})();
