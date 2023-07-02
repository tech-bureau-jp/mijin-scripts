import json

import websocket
from helper import get_config


def on_message(ws, message):
    json_data = json.loads(message)
    if "uid" in json_data:
        uid = json_data["uid"]
        body = json.dumps({"uid": uid, "subscribe": "block"})
        ws.send(body)
        body = json.dumps({"uid": uid, "subscribe": "finalizedBlock"})
        ws.send(body)

    if json_data.get("topic"):
        topic = json_data["topic"]
        if topic == "block":
            height = json_data["data"]["block"]["height"]
            print(f"height {height}")
        elif topic == "finalizedBlock":
            height = json_data["data"]["height"]
            print(f"finalize height {height}")


def block_check_lister():
    config = get_config()
    url = config["private1"]["url"]
    ws_url = url.replace("https", "wss")
    ws = websocket.WebSocketApp(
        ws_url + "/ws",
        on_message=on_message,
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
    block_check_lister()
