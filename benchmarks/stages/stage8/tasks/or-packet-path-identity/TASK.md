# Prevent unrelated packet text from hiding recovery evidence

OpenRelay combines a prepared context packet with task handoff and project
memory. Today a recovery excerpt can disappear merely because its basename or
path occurs somewhere in unrelated packet text. Make suppression depend on an
actual excerpt for the same repository-relative source path. A different
directory with the same basename must remain distinct, as must arbitrary text
that mentions the filename. Preserve suppression when the packet really does
contain that exact source file, and keep the output budget and provenance
behavior intact.

Run the relevant local tests. Make the smallest maintainable change across the
packet producer and the auxiliary-context consumer.
