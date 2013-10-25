# s3-tile-purger

Given appropriate credentials, I purge S3 buckets containing map tiles
according to various criteria.

## Tile Purging

To remove PNG tiles at z15+:

```bash
foreman run -- node purge.js -z 15 -e png
```

To remove UTFGrids from a `labels` layer:

```bash
foreman run -- node purge.js -s labels -e json
```

To remove tiles older than 30 days:

```bash
foreman run -- node purge.js -a 2592000
```

## Environment Variables

* `AWS_ACCESS_KEY_ID` - AWS access key id.
* `AWS_SECRET_ACCESS_KEY` - AWS secret access key.
* `S3_BUCKET` - S3 bucket to use.
