import datetime
from binascii import unhexlify
from json import dumps, loads

import httpx
import websocket
from helper import generate_deadline, generate_nonce, get_config
from symbolchain.CryptoTypes import Hash256, PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.sc import Amount
from symbolchain.symbol.Network import Network


def mosaic_definition():
    config = get_config()
    url = config["private1"]["url"]
    raw_privatekey = config["private1"]["workaddress"]["privatekey"]

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

    # Mosaicの作成準備
    nonce = generate_nonce()
    deadline = generate_deadline(epoch)

    # Mosaic作成するためのトランザクションを作成
    mosaic_definition_transaction = facade.transaction_factory.create_embedded(
        {
            "signer_public_key": account.public_key,
            "type": "mosaic_definition_transaction_v1",
            "duration": 0,  # 無期限のMosaic
            "divisibility": 0,  # 可分性
            "nonce": nonce,
            "flags": "supply_mutable restrictable transferable",
        }
    )
    # 先頭2文字は0xなので除去
    mosaic_id = str(mosaic_definition_transaction.id)[2:]

    # Mosaicの初期供給量を設定する
    supply_change_transaction = facade.transaction_factory.create_embedded(
        {
            "signer_public_key": account.public_key,
            "type": "mosaic_supply_change_transaction_v1",
            "mosaic_id": mosaic_definition_transaction.id.value,
            "action": "increase",
            "delta": Amount(100),
        }
    )

    # トランザクションを纏める
    embedded_transactions = [mosaic_definition_transaction, supply_change_transaction]
    transactions_hash = facade.hash_embedded_transactions(embedded_transactions)
    aggregate_transaction = facade.transaction_factory.create(
        {
            "type": "aggregate_complete_transaction_v2",
            "signer_public_key": account.public_key,
            "deadline": deadline,
            "transactions_hash": transactions_hash,
            "transactions": embedded_transactions,
        }
    )
    aggregate_transaction.fee = Amount(0)

    # 作成したトランザクションに署名する
    signature = facade.sign_transaction(account, aggregate_transaction)
    json_payload = facade.transaction_factory.attach_signature(
        aggregate_transaction, signature
    )
    data = loads(json_payload)

    # トランザクションID
    aggregate_hash = facade.hash_transaction(aggregate_transaction)
    signed_transaction = {
        "SignedTransaction": {
            "payload": data["payload"],
            "hash": str(aggregate_hash),
            "signerPublicKey": str(account.public_key),
            "type": aggregate_transaction.type_.value,
            "networkType": facade.network.identifier,
        }
    }
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
                print("New Mosaic Id", mosaic_id)
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
    mosaic_definition()
