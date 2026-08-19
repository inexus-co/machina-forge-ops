#!/bin/bash
# Two TigerVNC displays, differing only in what VeNCrypt sub-types they will accept.
#
#   :1 → 5901   Plain and TLSPlain   — cleartext credentials, or credentials inside anonymous TLS
#   :2 → 5902   X509Plain            — credentials inside TLS, with a certificate to pin
#
# The split is the point. Anonymous TLS is what TigerVNC offers by default and what this client
# cannot speak (Node's OpenSSL carries no anonymous cipher suites), so :1 is where "refuse with a
# reason, or fall back to Plain if the operator allowed it" is exercised, and :2 is where the
# working encrypted path is. Credentials are the container's own root account, checked by PAM.
set -e

echo "root:vncpass" | chpasswd
mkdir -p /root/.vnc
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=machina-test-tigervnc" \
  -keyout /root/.vnc/key.pem -out /root/.vnc/cert.pem 2>/dev/null
export HOME=/root

Xtigervnc :1 -geometry 1024x768 -depth 24 -rfbport 5901 -localhost=0 \
  -SecurityTypes VeNCrypt,TLSPlain,Plain -PlainUsers root -AlwaysShared \
  -desktop tigervnc-plain >/tmp/tigervnc-1.log 2>&1 &

Xtigervnc :2 -geometry 1024x768 -depth 24 -rfbport 5902 -localhost=0 \
  -SecurityTypes VeNCrypt,X509Plain -PlainUsers root -AlwaysShared \
  -X509Cert /root/.vnc/cert.pem -X509Key /root/.vnc/key.pem \
  -desktop tigervnc-x509 >/tmp/tigervnc-2.log 2>&1 &

sleep 4
DISPLAY=:1 fluxbox >/dev/null 2>&1 &
DISPLAY=:1 xterm >/dev/null 2>&1 &
sleep 1

echo "tigervnc up: 5901 (Plain/TLSPlain), 5902 (X509Plain) — root / vncpass"
tail -f /dev/null
