import datetime
import re
import sys
from binascii import unhexlify
from json import dumps, loads

import httpx
import websocket
from helper import get_config
from symbolchain.CryptoTypes import Hash256, PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.sc import DetachedCosignature, TransactionFactory
from symbolchain.symbol.Network import Network

hashlock_confirmed = False


def aggregate_bonded_transaction_cosign():
    config = get_config()
    url = config["private1"]["url"]
    option = sys.argv[1]
    tx_id = sys.argv[2]
    payload = sys.argv[3]
    if not re.match(r"address[1-9]", option) or not tx_id or not payload:
        print("option error")
        return
    raw_privatekey = config["private1"][option]["privatekey"]

    # mijinにアクセスして、Cookie, GenerationHash, epochAdjustmentを取得する
    r = httpx.get(url + "/network/properties")
    cookies = r.cookies
    cookies_list = []
    for k, v in cookies.items():
        cookie_str = f"{k}={v}"
        cookies_list.append(cookie_str)
    cookie = "; ".join(f"{c}" for c in cookies_list)

    network = r.json()
    generation_hash = network["network"]["generationHashSeed"]
    epoch = network["network"]["epochAdjustment"]
    epoch = epoch.replace("s", "")

    facade = SymbolFacade("mijinnet")
    facade.network = Network(
        "mijinnet",
        0x60,
        datetime.datetime.fromtimestamp(int(epoch)),
        Hash256(generation_hash),
    )

    # 送信元のアカウントをセット
    cosign_account = facade.KeyPair(PrivateKey(unhexlify(raw_privatekey)))
    address = facade.network.public_key_to_address(cosign_account.public_key)

    tx_response = httpx.get(url + f"/transactions/partial/{tx_id}")
    if tx_response.status_code != 200:
        raise Exception(f"transaction is not partial hash: {tx_id}")
    print(dumps(tx_response.json(), indent=2))

    bonded_transaction = TransactionFactory.deserialize(unhexlify(payload))

    cosignature: DetachedCosignature = facade.cosign_transaction(
        cosign_account, bonded_transaction, True
    )  # type: ignore
    cosignature_json_payload = {
        "version": str(cosignature.version),
        "signerPublicKey": str(cosignature.signer_public_key),
        "signature": str(cosignature.signature),
        "parentHash": str(cosignature.parent_hash),
    }
    headers = {"Content-Type": "application/json"}
    httpx.put(
        url + "/transactions/cosignature",
        headers=headers,
        json=cosignature_json_payload,
        cookies=cookies,
    )

    # websocketを作成する
    def on_message(ws, message):
        json_data = loads(message)
        subscribe_topic = f"confirmedAdded/{address}"
        if "uid" in json_data:
            uid = json_data["uid"]
            body = dumps({"uid": uid, "subscribe": subscribe_topic})
            ws.send(body)

        if json_data.get("topic"):
            topic = json_data["topic"]
            if topic == subscribe_topic:
                print("------------------- Success --------------------------------")
                print("Success: Transaction")
                print(dumps(json_data["data"], indent=2))
                print("------------------------------------------------------------")

    ws_url = url.replace("https", "wss")
    ws = websocket.WebSocketApp(
        ws_url + "/ws",
        on_message=on_message,
        cookie=cookie,
    )
    try:
        ws.run_forever()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(e)
    finally:
        ws.close()


if __name__ == "__main__":
    aggregate_bonded_transaction_cosign()
