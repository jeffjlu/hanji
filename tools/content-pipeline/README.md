# Content pipeline

Placeholder for the Python content pipeline (Phase 1).

See `plan.md`, section "Curriculum and content pipeline", for the pipeline design:
fetch pinned sources and check hashes, normalise into one lexical schema, segment
and annotate text (jieba/pypinyin for Mandarin, SudachiPy for Japanese), pick
Tatoeba cloze examples, generate audio, and emit `seed.json` plus the audio
manifest. The pipeline runs offline at build time and is never part of production.
