# D Dash Proxy
A reverse proxy that transforms MPEG-DASH stream from supported streaming server to HLS stream.

Many clients such as FFmpeg has issues handing dynamic MPD playlists, nor can they handle CENC enabled source properly.

By transforming the playlist and decoding segments involved on-the-fly, a variety of existing players can be used to play those steams indirectly.

## Getting Started
```bash
# Setup config
$ cp example.env .env
# Set up channel ID, channel name pair
$ cp example.channels.json channels.json
# Set up key ID, key pair
$ cp example.keys.json keys.json
# Install dependencies
$ npm install
# Start server instance
$ npm start
```

## Environment
- [Node v12+](https://nodejs.org/en/download/)