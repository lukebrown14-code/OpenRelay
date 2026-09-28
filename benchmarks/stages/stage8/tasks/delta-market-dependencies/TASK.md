# Protect configured markets that still have dependants

Delta lets a user remove a custom market only when nothing still uses it.
Ensure that this check covers every supported way the configuration can name a
market, including older universe-style entries as well as current targets and
data-source scopes. A rejected removal must leave the config unchanged and
name the dependant. An unused custom market should still be removable; built-in
markets remain protected.

Run the relevant offline tests. Follow the repository's config and target
contracts when changing the dependency check.
