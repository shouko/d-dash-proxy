#!/bin/bash
mkfifo pipe_audio.mp4
mkfifo pipe_video.mp4
export playlist="https://example.com/live/foo/manifest.mpd"
export cenc_key="00000000000000000000000000000000"
export output_local="-f flv rtmp://127.0.0.1:1935/my_live"
ffmpeg -loglevel error -stats -re -thread_queue_size 8192 -decryption_key "$cenc_key" -i pipe_audio.mp4 -re -thread_queue_size 8192 -decryption_key "$cenc_key" -i pipe_video.mp4 -c copy -bufsize 8000k $output_local & node app_old.js "$playlist"
