import json
import re
import sys
from binascii import unhexlify
from datetime import datetime

import httpx
from helper import get_config
from symbolchain.CryptoTypes import Hash256, PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.symbol.Network import Network


def account_info():
    option = sys.argv[1]
    if not re.match(r"address[1-9]", option) and option != "workaddress":
        print("option error")
        return
    config = get_config()
    url = config["private1"]["url"]
    raw_privatekey = config["private1"][option]["privatekey"]

    network = httpx.get(url + "/network/properties").json()
    generation_hash = network["network"]["generationHashSeed"]
    epoch = network["network"]["epochAdjustment"]
    epoch = epoch.replace("s", "")

    facade = SymbolFacade("mijinnet")
    facade.network = Network(
        "mijinnet",
        0x60,
        datetime.fromtimestamp(int(epoch)),
        Hash256(generation_hash),
    )
    account = facade.KeyPair(PrivateKey(unhexlify(raw_privatekey)))
    address = facade.network.public_key_to_address(account.public_key)

    account_info = httpx.get(url + f"/accounts/{address}")
    account_info = account_info.json() if account_info.status_code == 200 else None

    # mosaic情報を取得
    headers = {"Content-Type": "application/json"}
    mosaics = []
    linked_keys = {"linked": None, "node": None, "vrf": None, "voting": None}
    if account_info:
        # mosaic
        account_mosaics = account_info["account"]["mosaics"]
        account_mosaic_id = [
            mosaic["id"] for mosaic in account_info["account"]["mosaics"]
        ]
        params = {"mosaicIds": account_mosaic_id}
        namespace_mosaics = httpx.post(
            url + "/namespaces/mosaic/names", headers=headers, json=params
        )
        namespace_mosaics = (
            namespace_mosaics.json() if namespace_mosaics.status_code == 200 else None
        )
        for mosaic in account_mosaics:
            namespace_alias = "No Namespace"
            if namespace_mosaics:
                for m in namespace_mosaics["mosaicNames"]:
                    if mosaic["id"] == m["mosaicId"]:
                        if len(m["names"]) > 0:
                            namespace_alias = m["names"][0]
            mosaics.append(
                {
                    "mosaic": mosaic["id"],
                    "amount": mosaic["amount"],
                    "namespaceAlias": namespace_alias,
                }
            )

        # vrf
        if account_info["account"]["supplementalPublicKeys"]:
            linked_keys = account_info["account"]["supplementalPublicKeys"]

    multisig_info = httpx.get(url + f"/account/{address}/multisig")
    multisig_info = multisig_info.json() if multisig_info.status_code == 200 else None
    cosignatory_addresses = (
        multisig_info["multisig"]["cosignatoryAddresses"] if multisig_info else []
    )
    if len(cosignatory_addresses) > 0:
        cosignatory_addresses = [
            str(facade.Address(unhexlify(address))) for address in cosignatory_addresses
        ]

    # metadata
    params = {
        "pageNumber": 1,
        "pageSize": 100,
        "order": "desc",
        "sourceAddress": str(address),
    }
    metadata_info = httpx.get(url + "/metadata", params=params)
    metadata_info = metadata_info.json() if metadata_info.status_code == 200 else None
    meta = []
    if metadata_info and metadata_info["data"]:
        for data in metadata_info["data"]:
            entry = data["metadataEntry"]
            metadata = {
                "id": data["id"],
                "scopedMetadataKey": entry["scopedMetadataKey"],
                "sourceAddress": entry["sourceAddress"],
                "targetAddress": entry["targetAddress"],
                "metadataType": entry["metadataType"],
                "targetId": entry["targetId"],
                "metadataValue": bytes.fromhex(entry["value"]).decode("utf8"),
            }
            meta.append(metadata)

    account_info_dto = {
        "AccountInfo": {
            "url": url,
            "network": facade.network.identifier,
            "account": option,
            "address": str(address),
            "mosaics": mosaics,
            "linkedKeys": linked_keys,
            "meta": meta,
            "multisig": cosignatory_addresses,
        }
    }
    print(json.dumps(account_info_dto, indent=2))


if __name__ == "__main__":
    account_info()
