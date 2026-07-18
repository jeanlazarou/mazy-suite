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

| Shortcut    | Description                 |
| ----------- | --------------------------- |
| ctrl + e    | enter editor mode           |
| ctrl + r    | reload, to exit editor mode |
| left arrow  | navigate to previous track  |
| right arrow | navigate to next track      |
| space       | stop/start animation        |

## Connection with a player server

Register to a player server WebSocket to receive start/stop commands, using a channel named `player`.

By default the app connects with the following URL

```
ws://localhost:51987
```

You can pass `wsUrl` parameter in the url to set the player server URL. Example: `http://localhost:5173/?wsUrl=localhost:8080`.

## Stating in edit mode

You can pass `edit` parameter in the url to enter edit mode. Example: `http://localhost:5173/?edit=true`.
