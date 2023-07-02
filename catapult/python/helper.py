import datetime
import hashlib
import json
import secrets
from typing import Any


def get_config() -> dict[str, Any]:
    with open("config/local.json") as f:
        config = json.load(f)
    return config


def generate_nonce():
    nonce = secrets.token_hex(4)
    return int(nonce, 16)


def generate_deadline(epoch: int, add_minutes=60):
    deadline = (
        int(
            (
                datetime.datetime.today() + datetime.timedelta(minutes=add_minutes)
            ).timestamp()
        )
        - int(epoch)
    ) * 1000
    return deadline


def encode_message(message: str) -> bytes:
    return bytes(1) + message.encode("utf8")


def generate_uint64_key(input_str: str) -> int:
    if len(input_str) == 0:
        raise ValueError("Input must not be empty")

    input_bytes = input_str.encode()
    hash_bytes = hashlib.sha3_256(input_bytes).digest()
    result = int.from_bytes(hash_bytes[:8], byteorder="big")
    return result
