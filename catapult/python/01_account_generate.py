from json import dumps

import httpx
from helper import get_config
from symbolchain.CryptoTypes import Hash256, PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.symbol.Network import Network


def account_generate():
    config = get_config()
    url = config["private1"]["url"]

    network = httpx.get(url + "/network/properties").json()
    generation_hash = network["network"]["generationHashSeed"]

    facade = SymbolFacade("mijinnet")
    facade.network = Network(
        "mijinnet",
        0x60,
        Hash256(generation_hash),
    )
    accounts = dict()
    for i in range(7):
        key_pair = facade.KeyPair(PrivateKey.random())
        address = facade.network.public_key_to_address(key_pair.public_key)

        if i == 0:
            accounts["workaddress"] = {
                "address": str(address),
                "privatekey": str(key_pair.private_key),
                "mosaicId": "",
                "namespace": "",
            }
            continue

        accounts["address" + str(i)] = {
            "address": str(address),
            "privatekey": str(key_pair.private_key),
            "mosaicId": "",
            "namespace": "",
        }
    print(dumps(accounts, indent=2))


if __name__ == "__main__":
    account_generate()
