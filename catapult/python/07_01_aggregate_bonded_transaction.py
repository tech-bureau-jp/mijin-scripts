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


def aggregate_bonded_transaction():
    config = get_config()
    url = config["private1"]["url"]
    raw_privatekey_1 = config["private1"]["address1"]["privatekey"]
    raw_privatekey_2 = config["private1"]["address2"]["privatekey"]
    raw_privatekey_3 = config["private1"]["address3"]["privatekey"]
    min_fee_multiplier = config["private1"]["minfeemultiplier"]
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
    currency_mosaic_id = network["chain"]["currencyMosaicId"]
    currency_mosaic_id = currency_mosaic_id.replace("'", "")
    currency_mosaic_id = currency_mosaic_id[2:]
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
    account_1 = facade.KeyPair(PrivateKey(unhexlify(raw_privatekey_1)))
    account_2 = facade.KeyPair(PrivateKey(unhexlify(raw_privatekey_2)))
    account_3 = facade.KeyPair(PrivateKey(unhexlify(raw_privatekey_3)))

    address_1 = facade.network.public_key_to_address(account_1.public_key)
    address_3 = facade.network.public_key_to_address(account_3.public_key)

    # トランザクションを作成するための内容を作る
    deadline = generate_deadline(epoch)
    fee = Amount(min_fee_multiplier)
    amount = Amount(1)

    transfer_transaction1 = facade.transaction_factory.create_embedded(
        {
            "signer_public_key": account_1.public_key,
            "type": "transfer_transaction_v1",
            "recipient_address": address_3,
            "mosaics": [
                {
                    "mosaic_id": int(mosaic_id, 16),
                    "amount": amount,
                }
            ],
            "message": encode_message("TEST MIJIN tx1"),
        }
    )

    transfer_transaction2 = facade.transaction_factory.create_embedded(
        {
            "signer_public_key": account_2.public_key,
            "type": "transfer_transaction_v1",
            "recipient_address": address_3,
            "mosaics": [
                {
                    "mosaic_id": int(mosaic_id, 16),
                    "amount": amount,
                }
            ],
            "message": encode_message("TEST MIJIN tx2"),
        }
    )

    # トランザクションを纏める
    embedded_transactions = [
        transfer_transaction1,
        transfer_transaction2,
    ]
    transactions_hash = facade.hash_embedded_transactions(embedded_transactions)

    bonded_transaction = facade.transaction_factory.create(
        {
            "type": "aggregate_bonded_transaction_v2",
            "signer_public_key": account_1.public_key,
            "deadline": deadline,
            "transactions_hash": transactions_hash,
            "transactions": embedded_transactions,
            "fee": fee,
        }
    )
    bonded_transaction.fee = Amount(0)
    bonded_signature = facade.sign_transaction(account_1, bonded_transaction)
    bonded_json_payload = facade.transaction_factory.attach_signature(
        bonded_transaction, bonded_signature
    )
    bonded_data = loads(bonded_json_payload)
    bonded_transaction_hash = facade.hash_transaction(bonded_transaction)
    signed_bonded_transaction = {
        "SignedTransaction": {
            "payload": bonded_data["payload"],
            "hash": str(bonded_transaction_hash),
            "signerPublicKey": str(account_1.public_key),
            "type": bonded_transaction.type_.value,
            "networkType": facade.network.identifier,
        }
    }
    print("------------------- signedTransaction ------------------------")
    print(dumps(signed_bonded_transaction, indent=2))

    hashlock_transaction = facade.transaction_factory.create(
        {
            "signer_public_key": account_1.public_key,
            "deadline": deadline,
            "type": "hash_lock_transaction_v1",
            "mosaic": {
                "mosaic_id": int(currency_mosaic_id, 16),
                "amount": 0,
            },
            "duration": 1000,
            "hash": bonded_transaction_hash,
        }
    )

    # 作成したトランザクションに署名する
    signature = facade.sign_transaction(account_1, hashlock_transaction)
    json_payload = facade.transaction_factory.attach_signature(
        hashlock_transaction, signature
    )
    data = loads(json_payload)
    transaction_hash = facade.hash_transaction(hashlock_transaction)
    signed_hashlock_transaction = {
        "SignedTransaction": {
            "payload": data["payload"],
            "hash": str(transaction_hash),
            "signerPublicKey": str(account_1.public_key),
            "type": hashlock_transaction.type_.value,
            "networkType": facade.network.identifier,
        }
    }

    # トランザクションID
    print("------------------- hashLockTransaction ------------------------")
    print(dumps(signed_hashlock_transaction, indent=2))
    print("------------------- sendTransaction ------------------------")

    headers = {"Content-Type": "application/json"}
    # ハッシュロックを先に送る
    httpx.put(url + "/transactions", headers=headers, json=data, cookies=cookies)

    # websocketを作成する
    def on_message(ws, message):
        json_data = loads(message)
        subscribe_topic = f"confirmedAdded/{address_1}"
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
                # 承認されたらAggregateBondedを送る
                httpx.put(
                    url + "/transactions/partial",
                    headers=headers,
                    json=bonded_data,
                    cookies=cookies,
                )
                print(
                    "Next Command: python ./07_02_aggregate_bonded_transaction_cosign.py address2",
                    bonded_transaction_hash,
                    bonded_data["payload"],
                )
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
    aggregate_bonded_transaction()
