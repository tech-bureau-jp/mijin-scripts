import datetime
from binascii import unhexlify
from json import dumps, loads

import httpx
import websocket
from helper import encode_message, generate_deadline, get_config
from symbolchain.CryptoTypes import Hash256, PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.sc import Amount
from symbolchain.symbol.Network import Network


def mosaic_transfer():
    config = get_config()
    url = config["private1"]["url"]
    raw_privatekey = config["private1"]["workaddress"]["privatekey"]
    raw_mosaic_Id = config["private1"]["workaddress"]["mosaicId"]
    raw_recipient_address = config["private1"]["address1"]["address"]
    min_fee_multiplier = config["private1"]["minfeemultiplier"]
    send_mosaic_amount = 1

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

    # 送信先のアカウントをセット
    recipient_address = facade.Address(raw_recipient_address)

    # トランザクションを作成するための内容を作る
    deadline = generate_deadline(epoch)
    amount = Amount(send_mosaic_amount)
    fee = Amount(min_fee_multiplier)
    transfer_transaction = facade.transaction_factory.create(
        {
            "signer_public_key": account.public_key,
            "deadline": deadline,
            "type": "transfer_transaction_v1",
            "recipient_address": recipient_address,
            "mosaics": [
                {
                    "mosaic_id": int(raw_mosaic_Id, 16),
                    "amount": amount,
                }
            ],
            "message": encode_message("TEST MIJIN"),
            "fee": fee,
        }
    )

    # 作成したトランザクションに署名する
    signature = facade.sign_transaction(account, transfer_transaction)
    json_payload = facade.transaction_factory.attach_signature(
        transfer_transaction, signature
    )
    data = loads(json_payload)
    transaction_hash = facade.hash_transaction(transfer_transaction)
    signed_transaction = {
        "SignedTransaction": {
            "payload": data["payload"],
            "hash": str(transaction_hash),
            "signerPublicKey": str(account.public_key),
            "type": transfer_transaction.type_.value,
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
    mosaic_transfer()
