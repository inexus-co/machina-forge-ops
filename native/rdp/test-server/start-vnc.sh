#!/bin/bash
# One X display, a window manager, and two ways in: with a password and without one.
#
# Both are the same desktop (`-shared`), so a test can watch what another connection typed. The
# no-password port exists because "no authentication" is a security type of its own in RFB, and a
# client that only ever meets the password path has not been tested against half the servers there
# are — an appliance's console is usually wide open behind a private network.
set -e

Xvfb :0 -screen 0 1024x768x24 &
sleep 2
export DISPLAY=:0

fluxbox >/dev/null 2>&1 &
# Something to look at, and something to type into.
xterm -geometry 80x24+40+40 -fa Monospace -fs 12 -title "VNC test" &
xclock -geometry 200x200+700+400 >/dev/null 2>&1 &
sleep 1

x11vnc -storepasswd secret /tmp/vncpass
x11vnc -display :0 -rfbauth /tmp/vncpass -rfbport 5900 -forever -shared -noxdamage \
  >/tmp/x11vnc-auth.log 2>&1 &
x11vnc -display :0 -nopw -rfbport 5901 -forever -shared -noxdamage \
  >/tmp/x11vnc-none.log 2>&1 &
# The old handshake, still spoken by appliance consoles: one 4-byte security type, and no
# SecurityResult when there is no password. Claiming 3.8 at one of these deadlocked the client.
x11vnc -display :0 -rfbauth /tmp/vncpass -rfbport 5902 -rfbversion 3.3 -forever -shared -noxdamage \
  >/tmp/x11vnc-33.log 2>&1 &
sleep 1

echo "vnc up: 5900 (password=secret), 5901 (no auth), 5902 (RFB 3.3, password=secret)"
tail -f /dev/null
