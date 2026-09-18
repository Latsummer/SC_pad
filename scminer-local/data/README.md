# SCMINER local data

This directory contains the offline dataset for the planned local mineral search page.

- `scminer-data.json` is the canonical application dataset.
- `minerals.csv` contains mineral names, mining method, static server-base prices, scan signatures, and physical ratings.
- `distributions.csv` contains mineral-to-location abundance records. Use only rows where `available` is true when finding intersections.
- `signatures.csv` is a flat reverse-search index for ship-mining signatures and cluster sizes from 1 to 10 rocks.
- `names.zh-CN.json` is the editable bilingual name catalog. Fill in `zh` and optional alias arrays; keep the stable object keys unchanged.

`mining_methods` may contain more than one value. Hadanite, Aphorite, and Dolivine are shared by the site's ROC and FPS filters, so they are recorded as `roc|fps` in CSV and as arrays in JSON.

The data was prepared from the public SCMINER mineral directory and ore-by-location pages for game-data version `4.10.1-live.12660092`. Prices are static server-base values rather than live UEX prices. ROC and FPS gem prices are per unit; `scu_equivalent` records the website's 1,000-unit conversion. Aslarite and Ouratite have no server-base price in the source and remain empty. Carinite has a zero scan signature, so it is excluded from the reverse-signature index.

Ship-mining signature values follow `unit_signature × rock_count`. The flat index keeps every exact result because two different mineral/count combinations can theoretically produce the same observed value. The local page should return all exact candidates and use nearest-value matching only when no exact candidate exists.

Companion-mineral data is stored under each mineral's `composition` object and in the `secondary_ore` and `tertiary_trace` CSV columns. `associated_minerals` provides stable mineral IDs and explicit roles for UI links and reverse lookups. These labels reproduce SCMINER's “Secondary Ore” and “Tertiary Trace” fields; the source does not provide a percentage or guarantee for the companion relationship.

After editing or refreshing the canonical dataset, update the translation template without losing completed translations:

```sh
python3 tools/update_scminer_locale.py \
  --dataset scminer-local/data/scminer-data.json \
  --output scminer-local/data/names.zh-CN.json
```

The source site's public pages were fetched once and processed locally. The extractor at `tools/extract_scminer_data.py` performs no network requests, so future refreshes can use cached source files and remain explicit.
