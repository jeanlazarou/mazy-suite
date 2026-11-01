# App description

I need a lyric prompter for live concerts. The app uses a first JSON (see attached "albums.json") file containing the available list albums/playlists. Users select the album they want, the album name gives the name of another JSON file (see attached "default.json" for the album named "default"). For each album 2 cover images are possibly available "default.jpg" and "default-500.jpg" (in out example), they are the same, one is 205x250 pixels and the one with "-500" in the name is 500x500.
Each track title gives access to SRT files based on the track title (if the track title ends with "*" or "+", those characters are not used for the lyrics name.. See attached file "Days.txt" renamed because could not upload a "srt" extension text file. The audio file is the one from the playlist file.
The prompter should show the verse about to come and the following ones. The app should show a waveform, and also highlight the regions where some lyrics take place. Users should be able to start/stop/restart/pause go to next/previous also select the song they want to play. Selecting a song should start playing. At the end of the songs it just stops.  

## Driving gig_anim

The prompter can drive [gig_anim](../gig_anim/) running in another browser, on
another device of the same network: gig_anim then shows the animation of the
track you're on while it plays, and hides it while paused or stopped. Both apps
can be plain static builds: they talk directly to each other over WebRTC, with
no server in between and no internet needed.

The link is optional. To make it, click **Link gig_anim** under the player
controls, hand the invite to gig_anim (QR code or text), and bring its reply
back; the button turns green once linked. The steps on the gig_anim side are in
[its README](../gig_anim/README.md#following-the-live_prompter).

Reloading either page ends the link. Scanning a reply needs a camera and a page
served over `https` or from `localhost`; otherwise copy and paste the codes.

How the link works, and why it is built that way:
[docs/peer-link.md](../docs/peer-link.md).