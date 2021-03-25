# PicartoNotifier

forked from [PicartoNotifier](https://github.com/Banderi/PicartoNotifier) to work around new picarto api changes and give me my precious notifications back

highly likely this immediately breaks within a few days i guess or old functionality returns

## a summary of what's different here:
* OAuth required now to make use of the user-specific features of the [ptvapi.picarto.tv](https://ptvapi.picarto.tv/) API; whatever the /process/... API was, i can't find any trace of it
  * many API calls are changed, OAuth server has changed
  * couldn't get notification API to work without replying with "ERR syntax error"
  * no way for me to test out multistream stuff so i didn't make any changes there
* there doesn't seem to be a straightforward way to directly request user avatars now, so an intermediate call to the public API is needed
