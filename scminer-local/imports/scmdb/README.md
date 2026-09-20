# SCMDB public-page captures

Place JSON files exported by `dist/scmdb-capture.html` in this directory.

Each export contains only raw blueprint-card text rendered in the public SCMDB
Fabricator page. The future importer will convert these snapshots into the
static blueprint dataset and keep the snapshot as provenance.
# SCMDB public Fabricator imports

Put the JSON exported by the SCMDB public-page capture helper in this folder.

Run `make scmdb-import` to convert the current capture into
`scminer-local/data/scmdb-blueprints.json`. The importer only reads this local
export; it never requests SCMDB's disallowed `/data/` endpoints.
