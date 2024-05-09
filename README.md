# Bunny.net Storage Deployer

[Bunny.net](https://bunny.net/) is a really cheap and functional content delivery platform that makes it easy to host content.

This action performs 3 operations.

- Removes all the files from storage.
- Uploads files and folders to storage.
- Purges an associated pull zone.

Each operation can be activated with their respective upload, remove and purge flags.

## Inputs

_All the inputs are required except `verbose`_

### `upload`

It will upload files and folders if true provided.

### `remove`

It will remove all the files from storage before uploading if "true" provided. storageZoneName and storagePassword inputs should be provided.

### `storageZoneName`

The name of storage zone where you are connecting to.

### `storageEndpoint`

The storage endpoint. Default value is storage.bunnycdn.com

### `storagePassword`

The storage password. It should be read and write capable.

### `sourcePattern`

The glob pattern to retrieve the files from, like `./dist/**/*.js`

### `destination`

The destination directory that should be uploaded to in the bunny storage zone. (Example: www). The destination should _not_ have a trailing / as in www/.

If you want to upload files to a nested directory, you can specify the path to the directory in the destination parameter. For example, if you want to upload files to a directory called assets inside the www directory, you can set the destination parameter to www/assets.

Note that the nested directory will be automatically created by the CDN if it does not already exist.

### `purgePullZone`

It will purge the pull zone if "true" provided. pullZoneId and apiKey inputs should be provided.

### `apiKey`

The API key. You can retrieve your api key from your profile settings

### `pullZoneId`

Pull zone ID. You can retrieve your pull zone id directly from here: `https://dash.bunny.net/cdn/PULL_ZONE_ID/general/hostnames`

### `verbose`

Log more stuffs.

## Example usage

```
- name: Deploy to Bunny.net
  uses: djang0dev/bunnynet-storage-deploy@v0
  with:
    upload: true
    remove: true
    storageName: ${{ secrets.BUNNY_STORAGE_NAME }}
    storageEndpoint: "storage.bunnycdn.com"
    storagePassword: ${{ secrets.BUNNY_STORAGE_PASSWORD }}
    destination: "test/"
    sourcePattern: "./dist/**/*.*"
    apiKey: ${{ secrets.BUNNY_API_KEY }}
    purgePullZone: true
    pullZoneId: ${{ secrets.BUNNY_PULL_ZONE_ID }}
    verbose: true
```

# Refs
[ayeressian/bunnycdn-storage-deploy](https://github.com/ayeressian/bunnycdn-storage-deploy) - An equivalent, I got some issues with and I wanted to use a glob as source and learn some new effect tricks

# TODO
- [ ] Tests
- [ ] Convert as CLI if needed
