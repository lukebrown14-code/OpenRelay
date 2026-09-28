const ALIASES = {
  ":)": "slightly_smiling_face",
  ":wink:": "winking_face",
}

export function lookup(alias) {
  return ALIASES[alias] ?? null
}
