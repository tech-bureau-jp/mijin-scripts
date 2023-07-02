const { RepositoryFactoryHttp } = require("@tech-bureau/symbol-sdk");
const { firstValueFrom } = require("rxjs");
const config = require("config");

const url = config.get("private1.url");

(async () => {
  const repo = new RepositoryFactoryHttp(url);

  const chain = await firstValueFrom(repo.createChainRepository().getChainInfo());

  console.log("height", chain.height.compact());
  console.log("finaliize height", chain.latestFinalizedBlock.height.compact());
})();
