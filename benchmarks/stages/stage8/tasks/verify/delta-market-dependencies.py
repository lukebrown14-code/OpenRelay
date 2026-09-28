import os
import tempfile
from pathlib import Path

from delta.services import remove_market


with tempfile.TemporaryDirectory() as temp:
    os.chdir(temp)
    config = Path("config.toml")
    config.write_text('[markets.nz]\nlabel = "New Zealand"\ncurrency = "NZD"\n\n[universe]\nnz = ["ABC"]\n', encoding="utf-8")
    before = config.read_bytes()
    try:
        remove_market("nz")
    except ValueError as error:
        assert "universe" in str(error).lower() or "nz" in str(error).lower(), error
    else:
        raise AssertionError("market still used by legacy universe was removed")
    assert config.read_bytes() == before, "rejected removal changed config"
    config.write_text('[markets.nz]\nlabel = "New Zealand"\ncurrency = "NZD"\n', encoding="utf-8")
    remove_market("nz")
    assert "nz" not in config.read_text(encoding="utf-8")
    try:
        remove_market("us")
    except ValueError:
        pass
    else:
        raise AssertionError("built-in market was removed")
print("PASS: market dependency checks")
