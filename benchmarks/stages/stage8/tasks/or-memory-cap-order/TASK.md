# Make memory selection stable under large indexes

OpenRelay only considers a bounded number of project-memory notes. The result
must not depend on JSON object insertion order. An explicitly referenced note
must still be considered when the index contains more notes than the cap;
eligible path matches then use a stable order. Keep the existing validity,
conflict, and output-budget rules, and make the assembly report the notes it
actually renders.

Run the relevant local tests. Treat this as a change to the selection and
assembly contract, not merely a sorting tweak in one caller.
