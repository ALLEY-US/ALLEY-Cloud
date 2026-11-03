#!/usr/bin/env bash
# ALLEY Cloud personal WireGuard VPN + authenticated Squid proxy gateway.
# Target: Raspberry Pi 4/5 running Raspberry Pi OS 64-bit (Bookworm/Trixie).
# Also supports Debian/Ubuntu 64-bit. This provisions ONE owner/client for testing.
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash install-alley-pi-gateway.sh" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Cannot detect Linux distribution." >&2
  exit 1
fi
. /etc/os-release
case "${ID:-}" in
  raspbian|debian|ubuntu) ;;
  *) echo "This installer supports Raspberry Pi OS, Debian, or Ubuntu." >&2; exit 1 ;;
esac

ARCH="$(dpkg --print-architecture 2>/dev/null || true)"
if [[ "$ARCH" != "arm64" && "$ARCH" != "amd64" ]]; then
  echo "Use a 64-bit OS (arm64 or amd64). Detected architecture: ${ARCH:-unknown}." >&2
  exit 1
fi

WG_PORT="${WG_PORT:-51820}"
WG_NET="10.77.0.0/24"
WG_SERVER_IP="10.77.0.1"
WG_CLIENT_IP="10.77.0.2"
CLIENT_NAME="${CLIENT_NAME:-alley-owner}"
WAN_IF="${WAN_IF:-$(ip -o -4 route show to default | awk 'NR==1 {print $5}')}"
PUBLIC_ENDPOINT="${PUBLIC_ENDPOINT:-}"

if [[ ! "$CLIENT_NAME" =~ ^[A-Za-z0-9_-]{1,32}$ ]]; then
  echo "CLIENT_NAME may contain only letters, numbers, underscores, and hyphens (max 32 chars)." >&2
  exit 1
fi
if [[ ! "$WG_PORT" =~ ^[0-9]{1,5}$ ]] || (( WG_PORT < 1 || WG_PORT > 65535 )); then
  echo "WG_PORT must be a valid UDP port number." >&2
  exit 1
fi
if [[ -z "${WAN_IF// /}" ]]; then
  echo "Could not detect the default network interface. Re-run with WAN_IF=eth0 or WAN_IF=wlan0." >&2
  exit 1
fi
if [[ -e /etc/wireguard/wg0.conf ]]; then
  echo "/etc/wireguard/wg0.conf already exists. Refusing to overwrite an existing WireGuard setup." >&2
  exit 1
fi

if [[ -z "$PUBLIC_ENDPOINT" ]]; then
  if command -v curl >/dev/null 2>&1; then
    PUBLIC_ENDPOINT="$(curl -4fsS --max-time 8 https://api.ipify.org || true)"
  fi
fi
if [[ -z "$PUBLIC_ENDPOINT" ]]; then
  echo "Set PUBLIC_ENDPOINT to your public IPv4 address or a DDNS hostname, e.g. PUBLIC_ENDPOINT=vpn.example.com." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y wireguard wireguard-tools squid apache2-utils curl iptables qrencode openssl
# Stop the package default proxy immediately; it may listen on all interfaces until our private config is installed.
systemctl stop squid 2>/dev/null || true
systemctl disable squid 2>/dev/null || true

install -d -m 700 /etc/wireguard
umask 077
SERVER_PRIVATE_KEY="$(wg genkey)"
SERVER_PUBLIC_KEY="$(printf '%s' "$SERVER_PRIVATE_KEY" | wg pubkey)"
CLIENT_PRIVATE_KEY="$(wg genkey)"
CLIENT_PUBLIC_KEY="$(printf '%s' "$CLIENT_PRIVATE_KEY" | wg pubkey)"

cat > /etc/sysctl.d/99-alley-wireguard.conf <<'SYSCTL'
net.ipv4.ip_forward=1
SYSCTL
sysctl --system >/dev/null

cat > /etc/wireguard/wg0.conf <<WGCONF
[Interface]
Address = ${WG_SERVER_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVATE_KEY}
SaveConfig = false
PostUp = iptables -I FORWARD 1 -i %i -o ${WAN_IF} -j ACCEPT; iptables -I FORWARD 1 -i ${WAN_IF} -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s ${WG_NET} -o ${WAN_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -o ${WAN_IF} -j ACCEPT; iptables -D FORWARD -i ${WAN_IF} -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s ${WG_NET} -o ${WAN_IF} -j MASQUERADE

[Peer]
# ${CLIENT_NAME}
PublicKey = ${CLIENT_PUBLIC_KEY}
AllowedIPs = ${WG_CLIENT_IP}/32
WGCONF
chmod 600 /etc/wireguard/wg0.conf

SQUID_AUTH_HELPER="$(find /usr/lib/squid -type f -name basic_ncsa_auth -print -quit 2>/dev/null || true)"
if [[ -z "$SQUID_AUTH_HELPER" ]]; then
  echo "Could not find Squid's basic_ncsa_auth helper." >&2
  exit 1
fi
PROXY_USER="alley$(openssl rand -hex 3)"
PROXY_PASS="$(openssl rand -hex 18)"
htpasswd -Bbc /etc/squid/alley_passwd "$PROXY_USER" "$PROXY_PASS" >/dev/null
chown proxy:proxy /etc/squid/alley_passwd
chmod 640 /etc/squid/alley_passwd

cp -a /etc/squid/squid.conf "/etc/squid/squid.conf.alley-backup.$(date +%Y%m%d%H%M%S)"
cat > /etc/squid/squid.conf <<SQUID
# ALLEY Cloud personal test proxy. Bound ONLY to the private WireGuard IP.
http_port ${WG_SERVER_IP}:3128

acl alley_vpn_clients src ${WG_NET}
acl SSL_ports port 443
acl Safe_ports port 80 443 1025-65535
acl CONNECT method CONNECT
acl blocked_destinations dst 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16

http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access deny blocked_destinations
auth_param basic program ${SQUID_AUTH_HELPER} /etc/squid/alley_passwd
auth_param basic realm ALLEY Cloud Proxy
acl alley_authenticated proxy_auth REQUIRED
http_access allow alley_vpn_clients alley_authenticated
http_access deny all

cache deny all
access_log stdio:/var/log/squid/access.log
SQUID

squid -k parse

# Ensure the proxy starts only after WireGuard has created 10.77.0.1.
install -d -m 755 /etc/systemd/system/squid.service.d
cat > /etc/systemd/system/squid.service.d/alley-wireguard.conf <<'SYSTEMD'
[Unit]
Requires=wg-quick@wg0.service
After=wg-quick@wg0.service
SYSTEMD
systemctl daemon-reload

# If UFW is installed and active, allow only the VPN UDP port and routed VPN traffic.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "${WG_PORT}/udp"
  ufw route allow in on wg0 out on "${WAN_IF}" || true
fi

systemctl enable --now wg-quick@wg0
systemctl enable squid
systemctl restart squid

CALLER="${SUDO_USER:-root}"
if [[ "$CALLER" != "root" ]] && getent passwd "$CALLER" >/dev/null; then
  CALLER_HOME="$(getent passwd "$CALLER" | cut -d: -f6)"
else
  CALLER_HOME="/root"
fi
OUT_DIR="${ALLEY_OUTPUT_DIR:-${CALLER_HOME}/ALLEY-Network-Setup}"
install -d -m 700 "$OUT_DIR"

cat > "${OUT_DIR}/${CLIENT_NAME}.conf" <<CLIENTCONF
[Interface]
PrivateKey = ${CLIENT_PRIVATE_KEY}
Address = ${WG_CLIENT_IP}/32
DNS = 1.1.1.1, 1.0.0.1
MTU = 1380

[Peer]
PublicKey = ${SERVER_PUBLIC_KEY}
Endpoint = ${PUBLIC_ENDPOINT}:${WG_PORT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
CLIENTCONF
chmod 600 "${OUT_DIR}/${CLIENT_NAME}.conf"

cat > "${OUT_DIR}/proxy-credentials.txt" <<CREDS
ALLEY Cloud personal private test proxy
Connect WireGuard first. This proxy is NOT public.
Proxy host: ${WG_SERVER_IP}
Proxy port: 3128
Proxy type: HTTP (CONNECT supported)
Username: ${PROXY_USER}
Password: ${PROXY_PASS}
Do not share this file or upload it to GitHub.
CREDS
chmod 600 "${OUT_DIR}/proxy-credentials.txt"

cat > "${OUT_DIR}/server-details.txt" <<DETAILS
ALLEY Cloud personal gateway
Public endpoint: ${PUBLIC_ENDPOINT}
WireGuard UDP port: ${WG_PORT}
WireGuard server public key: ${SERVER_PUBLIC_KEY}
WireGuard interface: wg0
Detected LAN uplink: ${WAN_IF}
Private proxy: ${WG_SERVER_IP}:3128 (WireGuard tunnel only)
Client profile: ${OUT_DIR}/${CLIENT_NAME}.conf
Proxy credentials: ${OUT_DIR}/proxy-credentials.txt
This is one owner peer; not multi-user subscription provisioning.
DETAILS
chmod 600 "${OUT_DIR}/server-details.txt"

if [[ "$CALLER" != "root" ]] && id "$CALLER" >/dev/null 2>&1; then
  chown -R "$CALLER":"$(id -gn "$CALLER")" "$OUT_DIR"
fi

printf '\nALLEY Cloud personal test gateway installed.\n'
printf 'Detected uplink: %s\n' "$WAN_IF"
printf 'WireGuard endpoint: %s:%s/udp\n' "$PUBLIC_ENDPOINT" "$WG_PORT"
printf 'Client profile: %s/%s.conf\n' "$OUT_DIR" "$CLIENT_NAME"
printf 'Private proxy: %s:3128 (reachable only after VPN connects)\n' "$WG_SERVER_IP"
printf 'Proxy credentials: %s/proxy-credentials.txt\n' "$OUT_DIR"
printf '\nNEXT STEPS OUTSIDE THE PI:\n'
printf '  1. Give the Pi a reserved LAN IP in your router.\n'
printf '  2. Forward UDP %s from your router to this Pi LAN IP.\n' "$WG_PORT"
printf '  3. If using UFW, make sure its route rules allow wg0 to %s.\n' "$WAN_IF"
printf '  4. Securely copy the client .conf to your device and import it into WireGuard.\n'
printf '  5. Connect VPN, then set your browser HTTP proxy to %s:3128 with generated credentials.\n' "$WG_SERVER_IP"
printf '\nCHECKS:\n'
printf '  sudo wg show\n  sudo systemctl status wg-quick@wg0 squid --no-pager\n'
printf '  sudo ss -lntup | grep -E ":(3128|%s)\\b"\n' "$WG_PORT"
printf '\nNETWORK LIMITATIONS:\n'
printf '  - IPv4-only test tunnel; IPv6 traffic is not tunnelled by this profile.\n'
printf '  - One owner peer only; no customer provisioning or subscription enforcement.\n'
printf '  - If your ISP uses CGNAT, inbound port forwarding will not work; use a public-IP VPS or ask your ISP for a public IPv4 address.\n'
printf '  - Do not expose TCP 3128 to the internet. The proxy must stay VPN-only.\n\n'

if [[ -t 1 ]]; then
  echo "WireGuard QR (scan with the WireGuard mobile app):"
  qrencode -t ansiutf8 < "${OUT_DIR}/${CLIENT_NAME}.conf" || true
fi
