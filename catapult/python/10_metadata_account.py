import datetime
from binascii import unhexlify
from json import dumps, loads

import httpx
import websocket
from helper import generate_deadline, generate_uint64_key, get_config
from symbolchain.CryptoTypes import Hash256, PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.sc import Amount
from symbolchain.symbol.Metadata import metadata_update_value
from symbolchain.symbol.Network import Network


def metadata_account():
    config = get_config()
    url = config["private1"]["url"]
    raw_privatekey_w = config["private1"]["workaddress"]["privatekey"]
    min_fee_multiplier = config["private1"]["minfeemultiplier"]

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
    account = facade.KeyPair(PrivateKey(unhexlify(raw_privatekey_w)))
    address = facade.network.public_key_to_address(account.public_key)

    # トランザクションを作成するための内容を作る
    deadline = generate_deadline(epoch)
    fee = Amount(min_fee_multiplier)

    key = generate_uint64_key("AccountMetaTest")
    value = "AccountTest".encode("utf8")

    params = {
        "pageNumber": 1,
        "pageSize": 100,
        "order": "desc",
        "sourceAddress": str(address),
    }
    metadata_info = httpx.get(url + "/metadata", params=params, cookies=cookies)
    metadata_info = metadata_info.json() if metadata_info.status_code == 200 else None
    print(dumps(metadata_info, indent=2))

    # 既存のメタデータがある場合は更新する
    if metadata_info and metadata_info["data"]:
        metadata = metadata_info["data"][0]["metadataEntry"]
        old_value = bytes.fromhex(metadata["value"])
        new_value = value
        update_value = metadata_update_value(old_value, new_value)
        metadata_transaction = facade.transaction_factory.create_embedded(
            {
                "type": "account_metadata_transaction_v1",
                "signer_public_key": account.public_key,
                "target_address": address,
                "scoped_metadata_key": key,
                "value_size_delta": len(new_value) - len(old_value),
                "value": update_value,
            }
        )
    else:
        metadata_transaction = facade.transaction_factory.create_embedded(
            {
                "type": "account_metadata_transaction_v1",
                "signer_public_key": account.public_key,
                "target_address": address,
                "scoped_metadata_key": key,
                "value_size_delta": len(value),
                "value": value,
            }
        )

    # トランザクションを纏める
    embedded_transactions = [metadata_transaction]
    transactions_hash = facade.hash_embedded_transactions(embedded_transactions)
    aggregate_transaction = facade.transaction_factory.create(
        {
            "type": "aggregate_complete_transaction_v2",
            "signer_public_key": account.public_key,
            "deadline": deadline,
            "transactions_hash": transactions_hash,
            "transactions": embedded_transactions,
            "fee": fee,
        }
    )
    aggregate_transaction.fee = Amount(0)

    # 作成したトランザクションに署名する
    signature = facade.sign_transaction(account, aggregate_transaction)
    json_payload = facade.transaction_factory.attach_signature(
        aggregate_transaction, signature
    )
    data = loads(json_payload)
    transaction_hash = facade.hash_transaction(aggregate_transaction)
    signed_transaction = {
        "SignedTransaction": {
            "payload": data["payload"],
            "hash": str(transaction_hash),
            "signerPublicKey": str(account.public_key),
            "type": aggregate_transaction.type_.value,
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
    metadata_account()
