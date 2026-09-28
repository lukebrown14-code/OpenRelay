import os
import tempfile
from pathlib import Path

from delta.core import config
from delta.llm import catalog


with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    os.chdir(root)
    active = root / "settings" / "custom.toml"
    active.parent.mkdir()
    active.write_text('[llm]\nprovider = "openrouter"\n\n[plugins.rss]\nenabled = true\n', encoding="utf-8")
    config.CONFIG_PATH = active
    catalog.set_llm_route("report", "model-a")
    catalog.set_llm_model("model-b")
    catalog.set_llm_provider("custom")
    catalog.set_plugin_model("rss", "model-c")
    catalog.set_llm_custom(base_url="http://localhost:9999", api_key_env="LOCAL_KEY")
    assert not (root / "config.toml").exists(), "writeback created an unintended config.toml"
    raw = config.load_toml(active)
    assert raw["llm"]["routing"]["report"] == "model-a"
    assert raw["llm"]["model"] == "model-b"
    assert raw["llm"]["provider"] == "custom"
    assert raw["llm"]["base_url"] == "http://localhost:9999"
    assert raw["plugins"]["rss"]["enabled"] is True
    assert raw["plugins"]["rss"]["model"] == "model-c"
print("PASS: active config writeback")
