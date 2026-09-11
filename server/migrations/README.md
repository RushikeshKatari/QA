# Question normalization migration

Run `npm run migrate:questions` first. It is a dry run and reports proposed
groups without changing data. After reviewing the report, run
`npm run migrate:questions -- --apply`. The apply phase keeps an answered row
when one exists, aggregates `times_seen`, stores every absorbed row in the
audit table, and then assigns canonical hashes. New submissions are already
protected by the partial unique hash index.
