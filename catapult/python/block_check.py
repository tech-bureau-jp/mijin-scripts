import httpx
from helper import get_config


def block_check():
    config = get_config()
    url = config["private1"]["url"]

    chain_info = httpx.get(url + "/chain/info").json()
    height = chain_info["height"]
    finalize_height = chain_info["latestFinalizedBlock"]["height"]
    print(f"height {height}")
    print(f"finalize height {finalize_height}")


if __name__ == "__main__":
    block_check()
