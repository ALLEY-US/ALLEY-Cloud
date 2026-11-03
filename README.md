# ALLEY Cloud v1.1.4 — promo + Raspberry Pi VPN/proxy repair kit

This release contains the ALLEY Cloud one-file website and a matching Supabase backend for the permanent `159892-p` promo code, plus a single-owner WireGuard VPN and authenticated Squid proxy installer for a Raspberry Pi running Raspberry Pi OS 64-bit.

## Important: what is and is not live

- The HTML is a static front end. It cannot deploy Supabase functions or create a VPN service itself.
- The promo code works only after the SQL migration and both Edge Functions below are deployed to the Supabase project.
- The included VPN/proxy installer must be run on your Raspberry Pi (or compatible Debian/Ubuntu 64-bit server). It is not installed by GitHub Pages.
- The included Pi gateway is a **single-owner test gateway**. It does not yet provision separate VPN peers/proxy credentials for customers or enforce each subscription tier.
- No remote deployment was performed while preparing this package: no Supabase account or Raspberry Pi shell was connected.

## A. Fix the promo code

The latest website calls two functions named `redeem-promo` and `get-current-promo-code`. Earlier ALLEY Cloud packages included an older rotating-code function. If that older function was deployed, it does not match the fixed-code migration used by this version. Deploy the matching files in `supabase/functions/` from this package.

### 1. Confirm the Supabase project

The configured project reference is `bxehulzsshctpujelush` and the website URL is:

```text
https://bxehulzsshctpujelush.supabase.co
```

The browser uses the publishable key embedded in `index.html`. Do not place a secret key or service-role key in the website.

### 2. Create or confirm the owner account

In Supabase → Authentication → Users, create or locate the account for `khalidelanid2@gmail.com`. Copy its immutable **User UID**. Admin access is checked using both this UID and the email address; matching email alone is not sufficient.

If you disabled email confirmation, use a strong unique password and protect this owner account carefully.

### 3. Apply the SQL migration

Open Supabase → SQL Editor → New query. Copy and run:

`supabase/migrations/20261103000100_alley_fixed_promo.sql`

This migration creates the per-user promo entitlement table, rate-limit tables, and the service-role-only RPC `redeem_alley_fixed_promo`. It also drops the old rotating RPC if it exists. It does not reset existing promo entitlements.

### 4. Install and link the Supabase CLI

From the extracted project folder:

```bash
npm install -g supabase
supabase login
supabase link --project-ref bxehulzsshctpujelush
```

### 5. Set private function secrets

Replace `PASTE_OWNER_AUTH_UID_HERE` with the real UID from Supabase Authentication → Users:

```bash
supabase secrets set ALLEY_FIXED_PROMO_CODE=159892-p ALLEY_OWNER_USER_ID=PASTE_OWNER_AUTH_UID_HERE ALLEY_OWNER_EMAIL=khalidelanid2@gmail.com
```

Keep these secrets out of GitHub and `index.html`. The functions support both the newer `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` environment variables and the legacy single-key environment variables supplied by Supabase.

### 6. Deploy the matching functions

```bash
supabase functions deploy redeem-promo --use-api
supabase functions deploy get-current-promo-code --use-api
```

Supabase Edge Function deployments and secret handling are documented at:

- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/functions/secrets

### 7. Test promo redemption

1. Sign into ALLEY Cloud with a test user who has not previously redeemed the promo.
2. Open Pricing and enter `159892-p`.
3. Expect ALLEY Prime/all-feature access to be written to `public.alley_promo_access`.
4. The same account cannot redeem again; a new account can redeem the same permanent code once.
5. Sign into the owner account. The owner-only dashboard code panel calls `get-current-promo-code` and should display `159892-p` plus the redemption count.

**The promo code stays the same.** It is not rotated. Each Supabase account may redeem once. Ordinary redeemers receive the all-feature/Prime entitlement, not admin. Only the configured owner UID plus email receives `admin_access`.

### Promo error guide

| Error in the website | Likely cause | Fix |
|---|---|---|
| Promo service not configured / HTTP 503 | One or more owner secrets are missing | Re-run `supabase secrets set ...`, then redeploy both functions |
| Function not found / HTTP 404 | Edge Function has not been deployed or is named differently | Deploy the exact `redeem-promo` and `get-current-promo-code` directories |
| Promo database migration missing / HTTP 500 | SQL RPC/table migration not applied, or old rotating backend is still deployed | Run the SQL migration, then deploy the matching fixed-code functions from this package |
| Sign in before redeeming / HTTP 401 | User is not signed in or session expired | Sign in again; if using no-email-verification signup, confirm Supabase Email Confirm is OFF |
| Already redeemed | This account already has a row in `alley_promo_access` | Test with a separate account; redemption is intentionally once per account |
| Invalid code | Server secret differs from the entered code | Set `ALLEY_FIXED_PROMO_CODE=159892-p` and redeploy |
| Owner code not visible | Owner UID/email secrets do not match the signed-in user | Check the exact Auth UID and email; reset the two owner secrets |

## B. Bring up the personal VPN and proxy on Raspberry Pi

This installer targets a Raspberry Pi 4/5 running Raspberry Pi OS 64-bit (Bookworm/Trixie). It is also compatible with Debian/Ubuntu 64-bit systems. It installs:

- WireGuard VPN (IPv4) on UDP port `51820`.
- An authenticated Squid HTTP proxy on `10.77.0.1:3128`, bound only to the VPN interface.
- One owner/client profile and a randomly generated proxy username/password.

### 1. Prepare the Raspberry Pi

- Use Raspberry Pi OS 64-bit and update it.
- Connect the Pi by Ethernet if possible.
- In your router, create a DHCP reservation so the Pi keeps the same LAN IP address.
- Make sure you have a public IPv4 address that can accept inbound connections.

Compare the router's WAN/Internet IPv4 address with the address from `curl -4 https://api.ipify.org`. If the router WAN address differs, or it falls in `100.64.0.0/10`, `10.0.0.0/8`, or another private range, you may be behind CGNAT/double NAT. Ordinary port forwarding will not work through CGNAT; ask your ISP for a public IPv4 address or use a public VPS as the WireGuard endpoint.

### 2. Forward the VPN port

In your router, forward **UDP 51820** to the Raspberry Pi's reserved LAN IP. Do not forward TCP 3128. The proxy must remain private inside the VPN.

If your home IP changes, use a DDNS hostname and pass it as `PUBLIC_ENDPOINT` when running the installer. The DNS record must point to your public IP and must not be an HTTP-only proxy.

### 3. Run the installer

Copy `network/install-alley-pi-gateway.sh` to your Pi, then run:

```bash
sudo bash install-alley-pi-gateway.sh
```

If you want to use a DDNS hostname:

```bash
sudo PUBLIC_ENDPOINT=vpn.example.com bash install-alley-pi-gateway.sh
```

The script creates these files in `~/ALLEY-Network-Setup/` (or `/root/ALLEY-Network-Setup/` if run directly as root):

- `alley-owner.conf` — private WireGuard client profile.
- `proxy-credentials.txt` — generated proxy username/password.
- `server-details.txt` — endpoint and setup notes.

Keep these files private. Never upload them to GitHub or paste them into chat.

### 4. Connect from your device

1. Install the official WireGuard app: https://www.wireguard.com/install/
2. Securely copy `alley-owner.conf` to your phone/laptop and import it.
3. Connect the tunnel. The client routes IPv4 through your home connection.
4. To use the proxy as well, configure your browser/app HTTP proxy as `10.77.0.1`, port `3128`, and enter the generated credentials from `proxy-credentials.txt`.
5. Test the VPN with `curl -4 https://api.ipify.org`; it should report your home's public IPv4 address while the tunnel is connected.

### 5. Troubleshooting

On the Pi:

```bash
sudo wg show
sudo systemctl status wg-quick@wg0 squid --no-pager
sudo ss -lntup | grep -E ':(51820|3128)\\b'
```

- No WireGuard handshake: check UDP 51820 port forwarding, Pi firewall, public IP/CGNAT, and client endpoint.
- Handshake works but no browsing: check IPv4 forwarding, NAT rules, DNS, and outbound router rules.
- Proxy connection fails: connect WireGuard first; check `sudo systemctl status squid`; confirm Squid listens at `10.77.0.1:3128`; re-check the generated username/password.
- Do not open TCP 3128 to the public internet.

### Limitations of this first gateway

This installer creates one owner peer only. It is not the production multi-user ALLEY Cloud VPN/proxy service. To sell VPN/proxy subscriptions, the next backend must create and revoke a unique WireGuard peer and proxy credential per customer, enforce subscription limits, and handle billing. This profile routes IPv4 only; IPv6 is not tunnelled by this starter and could bypass the VPN.

## C. Publish the website

Use the HTML file as the root `index.html` in your GitHub Pages repository. The website can call the deployed Supabase functions, but GitHub Pages cannot run SQL migrations, Edge Functions, WireGuard, or Squid.

Never publish the following in a public GitHub repository:

- Supabase secret/service-role keys.
- `ALLEY_FIXED_PROMO_CODE` if you want to keep the promo private.
- Raspberry Pi WireGuard private profiles or keys.
- Proxy passwords.
