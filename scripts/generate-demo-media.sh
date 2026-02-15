#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$ROOT_DIR/docs/assets"
WORK_DIR="$ROOT_DIR/.tmp/demo-media"

mkdir -p "$ASSETS_DIR" "$WORK_DIR"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required but not found." >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick (magick) is required but not found." >&2
  exit 1
fi

render_scene() {
  local idx="$1"
  local title="$2"
  local subtitle="$3"
  local body="$4"
  local body_file="$WORK_DIR/scene-${idx}.txt"
  local image_file="$WORK_DIR/scene-${idx}.png"

  printf '%s\n' "$body" > "$body_file"

  magick -size 1280x720 xc:'#0b1220' \
    -fill '#93c5fd' -font 'DejaVu-Sans-Mono' -pointsize 34 -annotate +56+72 "$title" \
    -fill '#94a3b8' -font 'DejaVu-Sans-Mono' -pointsize 18 -annotate +56+108 "$subtitle" \
    -fill '#e2e8f0' -font 'DejaVu-Sans-Mono' -pointsize 24 -annotate +56+170 "@$body_file" \
    "$image_file"
}

render_scene 1 \
  "NicheBot Full Setup and Run" \
  "1/7 Clone repo and install dependencies" \
  $'$ git clone https://github.com/eminemrre/nichebot.git\n$ cd nichebot\n$ npm install\n\nadded packages and locked dependencies'

render_scene 2 \
  "Enable Global Command" \
  "2/7 Make nichebot available from any directory" \
  $'$ npm run install:global\n$ nichebot help\n\nUsage: nichebot <command>\nsetup | doctor | start | stop | backup | restore | db'

render_scene 3 \
  "First-Run Wizard" \
  "3/7 Configure runtime in ~/.nichebot/.env" \
  $'$ nichebot setup\n? Language: tr\n? TELEGRAM_BOT_TOKEN: 123456:***\n? TELEGRAM_ALLOWED_USER_ID: 123456789\n? Provider: deepseek\n? DEEPSEEK_API_KEY: ***\n\nSaved: ~/.nichebot/.env'

render_scene 4 \
  "Preflight Validation" \
  "4/7 Check config and runtime health" \
  $'$ nichebot doctor\n\nruntime.home: ~/.nichebot\nconfig.valid: true\ntelegram.allowed_user: set\nbackup.latest.integrity: ok\nlock.active: false'

render_scene 5 \
  "Start Bot Runtime" \
  "5/7 Start polling and wait for Telegram commands" \
  $'$ nichebot start\n\nTelegram bot started\nObservability server started\nWaiting for commands...'

render_scene 6 \
  "Telegram Command Flow" \
  "6/7 Generate, review, and publish" \
  $'/uret\n-> Preview generated\n-> Quality score: 82/100\n/onayla\n-> Published to Twitter/X\n\nAlternative: /reddet to regenerate'

render_scene 7 \
  "Operations Safety" \
  "7/7 Backup and database health checks" \
  $'$ nichebot backup\n-> Snapshot created\n$ nichebot db doctor\n-> sqlite integrity: ok\n\nProduction-ready terminal workflow complete.'

CONCAT_FILE="$WORK_DIR/scenes.txt"
: > "$CONCAT_FILE"

DURATIONS=(3 3 4 4 4 4 4)
for i in "${!DURATIONS[@]}"; do
  idx=$((i + 1))
  printf "file '%s/scene-%d.png'\n" "$WORK_DIR" "$idx" >> "$CONCAT_FILE"
  printf "duration %s\n" "${DURATIONS[$i]}" >> "$CONCAT_FILE"
done
printf "file '%s/scene-7.png'\n" "$WORK_DIR" >> "$CONCAT_FILE"

ffmpeg -y -f concat -safe 0 -i "$CONCAT_FILE" \
  -vf "fps=24,format=yuv420p" \
  -movflags +faststart \
  "$ASSETS_DIR/nichebot-demo.mp4"

ffmpeg -y -i "$ASSETS_DIR/nichebot-demo.mp4" \
  -vf "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 \
  "$ASSETS_DIR/nichebot-demo.gif"

ls -lh "$ASSETS_DIR/nichebot-demo.mp4" "$ASSETS_DIR/nichebot-demo.gif"
echo "Demo media generated in $ASSETS_DIR"
