const { Account, RepositoryFactoryHttp, Address, Order } = require("@tech-bureau/symbol-sdk");
const config = require("config");
const url = config.get("private1.url");

const option = process.argv[2];

const { firstValueFrom } = require("rxjs");

if (!option.match(/address[1-9]/) && option !== "workaddress") {
  console.error("option error");
  return;
}

const rawsendadress = config.get(`private1.${option}.address`);
const rawprivatekey = config.get(`private1.${option}.privatekey`);
const address = Address.createFromRawAddress(rawsendadress);

(async () => {
  const repo = new RepositoryFactoryHttp(url);

  //Networktypeをcatapultから取得
  const networkType = await firstValueFrom(repo.getNetworkType());
  //GenerationHashをcatapultから取得
  const ghash = await firstValueFrom(repo.getGenerationHash());

  console.log("network", networkType);
  console.log("GenerationHash", ghash);

  try {
    const account = Account.createFromPrivateKey(rawprivatekey, networkType);

    const info = await firstValueFrom(repo.createAccountRepository().getAccountInfo(account.address));

    const multisig = await firstValueFrom(
      repo.createMultisigRepository().getMultisigAccountInfo(account.address)
    ).catch(() => "");

    // Mosaic情報を取得
    const mosaics = await Promise.all(
      info.mosaics.map(async (mosaic) => {
        const namespace = await firstValueFrom(repo.createNamespaceRepository().getMosaicsNames([mosaic.id]));
        return {
          mosaic: mosaic.id.toHex(),
          amount: mosaic.amount.toString(),
          namespaceAlias: namespace[0].names.length > 0 ? namespace[0].names[0].name : "No Namespace",
        };
      })
    );

    const searchCriteria = {
      pageNumber: 1,
      pageSize: 100,
      order: Order.Desc,
      sourceAddress: info.address,
    };

    const metaInfo = await firstValueFrom(repo.createMetadataRepository().search(searchCriteria));

    const meta = await Promise.all(
      metaInfo.data.map((m) => {
        return {
          id: m.id,
          scopedMetadataKey: m.metadataEntry.scopedMetadataKey.toHex(),
          sourceAddress: m.metadataEntry.sourceAddress.plain(),
          targetAddress: m.metadataEntry.targetAddress.plain(),
          metadataType: m.metadataEntry.metadataType,
          targetId: m.metadataEntry.targetId ? m.metadataEntry.targetId.toHex() : "None",
          metadataValue: m.metadataEntry.value,
        };
      })
    );

    const infoDto = {
      url: url,
      network: networkType.toString(),
      account: option,
      address: info.address.plain(),
      mosaics: mosaics ? mosaics : "None",
      linkedKeys: {
        linked: info.supplementalPublicKeys.linked ? info.supplementalPublicKeys.linked.publicKey : "None",
        node: info.supplementalPublicKeys.node ? info.supplementalPublicKeys.node.publicKey : "None",
        vrf: info.supplementalPublicKeys.vrf ? info.supplementalPublicKeys.vrf.publicKey : "None",
        voting: info.supplementalPublicKeys.voting
          ? info.supplementalPublicKeys.voting.map((v) => v.publicKey)
          : "None",
      },
      meta: meta ? meta : "None",
      multisig: multisig ? multisig.cosignatoryAddresses.map((address) => address.plain()) : [],
    };

    console.log("AccountInfo", infoDto);
  } catch (e) {
    console.error(e);
  }
})();
