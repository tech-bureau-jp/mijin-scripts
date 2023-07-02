import datetime
from binascii import unhexlify
from json import dumps, loads

import httpx
import websocket
from helper import generate_deadline, get_config
from symbolchain.CryptoTypes import Hash256, PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.sc import AliasAction, Amount, NamespaceId
from symbolchain.symbol.IdGenerator import generate_namespace_id
from symbolchain.symbol.Network import Network


def namespace_to_mosaic_alias():
    config = get_config()
    url = config["private1"]["url"]
    raw_privatekey = config["private1"]["workaddress"]["privatekey"]
    min_fee_multiplier = config["private1"]["minfeemultiplier"]
    namespace = config["private1"]["workaddress"]["namespace"]
    mosaic_id = config["private1"]["workaddress"]["mosaicId"]

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
    account = facade.KeyPair(PrivateKey(unhexlify(raw_privatekey)))
    address = facade.network.public_key_to_address(account.public_key)

    # トランザクションを作成するための内容を作る
    deadline = generate_deadline(epoch)
    fee = Amount(min_fee_multiplier)

    # namespace名からnamespace_idを取得
    namespace_id = NamespaceId(generate_namespace_id(namespace))

    mosaic_alias_transaction = facade.transaction_factory.create(
        {
            "signer_public_key": account.public_key,
            "deadline": deadline,
            "type": "mosaic_alias_transaction_v1",
            "namespace_id": namespace_id,
            "mosaic_id": int(mosaic_id, 16),
            "alias_action": AliasAction.LINK,
            "fee": fee,
        }
    )

    # 作成したトランザクションに署名する
    signature = facade.sign_transaction(account, mosaic_alias_transaction)
    json_payload = facade.transaction_factory.attach_signature(
        mosaic_alias_transaction, signature
    )
    data = loads(json_payload)
    transaction_hash = facade.hash_transaction(mosaic_alias_transaction)
    signed_transaction = {
        "SignedTransaction": {
            "payload": data["payload"],
            "hash": str(transaction_hash),
            "signerPublicKey": str(account.public_key),
            "type": mosaic_alias_transaction.type_.value,
            "networkType": facade.network.identifier,
        }
    }

    # トランザクションID
    print("------------------- signedTransaction ------------------------")
    print(dumps(signed_transaction, indent=2))
    print("------------------- sendTransaction ------------------------")

    headers = {"Content-Type": "application/json"}
    httpx.put(url + "/transactions", headers=headers, json=data, cookies=cookies)

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
    namespace_to_mosaic_alias()
