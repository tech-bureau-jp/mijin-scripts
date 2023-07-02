from datetime import datetime

import httpx
from helper import get_config


def block_info():
    config = get_config()
    url = config["private1"]["url"]

    network = httpx.get(url + "/network/properties").json()
    epoch = network["network"]["epochAdjustment"]
    epoch = epoch.replace("s", "")

    params = {"pageNumber": 1, "pageSize": 1, "order": "desc"}
    block_info = httpx.get(url + "/blocks", params=params).json()

    for data in block_info["data"]:
        meta = data["meta"]
        block = data["block"]
        block_timestamp = int(block["timestamp"]) / 1000
        print("-------------------------------------------------")
        print("BlockHeight", block["height"])
        print("Date", datetime.fromtimestamp(block_timestamp + int(epoch)))
        print("TotalTransaction", meta["transactionsCount"])
        print("-------------------------------------------------")


if __name__ == "__main__":
    block_info()
