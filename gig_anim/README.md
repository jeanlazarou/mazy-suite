# Gig animation

The app renders animation using tracks lyrics.

It loads a animation definition file like the following (a default file, named `data/default_performance.json`, is loaded).

```json
{
    "title": "End of the Story 2025",
    "date": "2024-10-10",
    "albums": [
        {
            "id": "office_cleaner",
            "title": "Office Cleaner",
            "coverImage": "office_cleaner-500.jpg"
        },
        {
            "id": "and-in-the-meantime",
            "title": "And in the Meantime",
            "coverImage": "and-in-the-meantime-500.jpg"
        },
        {
            "id": "thats-all",
            "title": "That's All",
            "coverImage": "thats-all-500.jpg"
        }
    ],
    "tracks": [
        {
            "albumId": "thats-all",
            "url": "/music/live/files/Live 24-What's Next-playback.mp3",
            "title": "What's Next",
            "rating": 5,
            "authors": [
                "Taylor Brae",
                "Jean Lazarou"
            ],
            "volume": 85,
            "theme": "cool",
            "animationDelay": 500,
            "animationType": "wall"
        },
        {
            "albumId": "thats-all",
            "url": "/music/live/files/Live 24-Alone-playback.mp3",
            "title": "Alone",
            "rating": 5,
            "authors": [
                "Taylor Brae",
                "Jean Lazarou"
            ],
            "volume": 85,
            "theme": "reds",
            "animationDelay": 0,
            "animationType": "spiral"
        },
        {
            "albumId": "and-in-the-meantime",
            "url": "/music/live/files/Live 24-Fight Pain-playback.mp3",
            "title": "Fight Pain*",
            "authors": [
                "Taylor Brae",
                "Jean Lazarou"
            ],
            "volume": 85,
            "animationType": "default"
        },
        {
            "albumId": "thats-all",
            "url": "/music/live/files/Live 24-So Many Mornings-playback.mp3",
            "title": "So Many Mornings+",
            "authors": [
                "Andrea Reggiani",
                "Jean Lazarou"
            ],
            "volume": 85,
            "theme": "autumn"
        },
        {
            "albumId": "office_cleaner",
            "url": "/music/live/files/Live 24-Witness of Happiness-playback.mp3",
            "title": "Witness of Happiness",
            "authors": [
                "Taylor Brae",
                "Jean Lazarou"
            ],
            "volume": 85,
            "theme": "monochrome"
        }
    ]
}
```

It starts playing the animations on load but you can enter the editor mode.

## Keyboard shortcuts

| Shortcut    | Description                                    |
| ----------- | ---------------------------------------------- |
| ctrl + e    | enter editor mode, and back to the show        |
| ctrl + r    | reload, to exit editor mode (drops the link)   |
| left arrow  | navigate to previous track                     |
| right arrow | navigate to next track                         |
| space       | stop/start animation                           |

## Following the live_prompter

The [live_prompter](../live_prompter/), running in another browser, on
another device of the same network, can drive the show: gig_anim then shows
the animation of the track the prompter is on, while it plays, and hides it
while it is paused or stopped. Both apps can be plain static builds: they talk
directly to each other over WebRTC, with no server in between and no internet
needed.

The link is optional and made by hand, in two hand-offs:

1. In the prompter, click **Link gig_anim**: it shows an invite, as a QR code
   and as text.
2. In gig_anim, press ctrl + e and, under **Prompter link** at the bottom of
   the panel, scan the QR code or paste the text, then click **Link**: it
   shows a reply.
3. Back in the prompter, scan or paste the reply and click **Connect**.

Press ctrl + e again to go back to the show: the link stays up. The prompter's
commands are ignored while the editor is open, except in its fullscreen
preview.

Tracks are matched by url first, then by title (case-insensitive), because a
performance usually plays the live playback files while the prompter's albums
point at the studio ones. While the prompter is on a track that isn't in the
performance, gig_anim shows nothing.

The `spotlight` animation also follows where the prompter is in the song: the
line being sung, big and swept as it is sung, between the previous and the
next ones. Without a link, it takes the song to start when the animation
shows.

Reloading either page ends the link: link again the same way. Scanning needs
a camera and a page served over `https` or from `localhost`; on a plain `http`
page from another machine, copy and paste the codes instead (AirDrop or the
Universal Clipboard between Apple devices, for instance).

## Stating in edit mode

You can pass `edit` parameter in the url to enter edit mode. Example: `http://localhost:5173/?edit=true`.
