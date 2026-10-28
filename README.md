# ALLEY Cloud

**Your AI. Your server. Your corner of the cloud.**

ALLEY Cloud is a responsive, single-file website concept for a service that brings together the NANO AI assistant, access to a user's Raspberry Pi home server, and personal website hosting. The site includes a marketing homepage, five subscription plans, a simulated AI chat, a simulated Raspberry Pi terminal, account-gated actions, login and signup screens, and an account dashboard.

> **Prototype status:** This repository currently contains a front-end demo. It does not yet provide real authentication, live NANO AI API requests, SSH access, domain provisioning, website deployment, or subscription payments. Pricing and quotas are example values and should be confirmed before a public commercial launch.

## Contents

- [`index.html`](./index.html) — the complete, self-contained website. CSS, JavaScript, SVG icons, and logo artwork are embedded in this file, so it does not need separate asset files to render.
- `README.md` — this project guide.

## Branding

The AI assistant is branded **NANO AI** and uses the NANO AI logo embedded directly in `index.html`, so no separate logo file is required to display the website. The ALLEY Cloud browser favicon remains the ALLEY Cloud mark.

## Website sections and features

### Home page and navigation

The homepage uses a dark navy and blue visual theme with pastel gradient accents. It is responsive for desktop and mobile screens and includes:

- Sticky navigation with links to Platform, NANO AI, Pi Access, Website Hosting, Plans, and FAQ.
- Hero section: “Your AI. Your server. Your corner of the cloud.”
- Product overview cards explaining the three core ideas: AI assistance, Raspberry Pi access, and personal website hosting.
- NANO AI preview with sample chat responses.
- Raspberry Pi terminal preview with simulated command output.
- Website preview showing an example project site and domain.
- Pricing cards for Free, Plus, Pro, Ultra, and Business. Click any plan card, plan button, or “View detailed plan” link to open a full breakdown of that plan.
- Proxy access and VPN access are listed only on Pro ($10/month) and Ultra ($25/month). These are planned features, not live proxy/VPN services.
- Interactive Business plan customizer with a $5/month base price, selectable add-ons, an estimate up to $100+, and a custom quote for larger configurations.
- FAQ section and a final call to action.
- Embedded styling, inline JavaScript, icons, and logo imagery so the site can be published as one HTML file.

### NANO AI concept

NANO AI is ALLEY Cloud’s named assistant. The AI section presents the intended use cases: explaining code, helping troubleshoot Linux commands, brainstorming projects, and planning builds. The current chat returns **sample demonstration responses**; it does not call a live AI backend.

To make NANO AI real, add a backend endpoint that calls your chosen AI model/provider, validates requests, enforces quotas, handles errors, and protects user data. Store provider credentials in a server-side secret or environment variable. **Never put a production AI API key in public HTML or client-side JavaScript.** If the product later supports bring-your-own-key, handle that key through a secure backend and clearly explain storage and privacy behavior.

### Raspberry Pi access concept

The Pi section describes the intended ability to reach a Raspberry Pi at home, manage projects, and use a browser-based terminal. The terminal shown on the homepage is a **simulation only**; it does not connect to a Pi, run commands, or open SSH sessions.

A production implementation should use an authenticated backend or private tunnel, device authorization, SSH keys, access controls, audit logging where appropriate, and safe session handling. Avoid exposing SSH private keys or passwords to the browser. Review network design, router/ISP limitations, updates, backups, and TLS before offering public access.

### Website hosting and domains

The website-hosting section illustrates the idea of creating a portfolio, personal site, or project page that can run on the user's Raspberry Pi. The concept proposes:

- A demo preview of an ALLEY Cloud subdomain on Free, with intended live domain features on paid plans.
- Custom-domain connection on eligible paid plans.
- A preview of what a customer's project website could look like.

The current demo does not allocate domains, edit DNS, issue certificates, upload site files, or configure hosting. Decide whether a future paid plan includes domain registration or only the ability to connect a domain. A production setup will need a hosting/deployment service, DNS routing, HTTPS, isolation between customers, backups, monitoring, and a plan for home-network uptime and bandwidth.

## Plans and sample pricing

The pricing cards are interactive: selecting a plan card, its details link, or the plan button opens a detailed feature view. The amounts and entitlements below describe the intended offer in this prototype; a production backend still needs to provision the resources and enforce quotas.

| Plan | Price | Intended features |
|---|---:|---|
| **Free** | **$0 / forever** | Demo-only access: sample NANO AI replies, simulated SSH terminal, and previews of website/domain tools. No live AI quota, Linux server, Proxy, VPN, or production hosting. |
| **Plus** | **$5 / month** | 500 NANO AI credits/day; 1 included IP/domain endpoint; 64 GB Cloud Storage; website publishing tools; one Linux server with SSH access; standard support. No Proxy/VPN. |
| **Pro** | **$10 / month** | Everything in Plus, upgraded to 1,500 NANO AI credits/day and 128 GB Cloud Storage; 1 custom domain; Proxy access; VPN access; one Linux server with SSH access; advanced tools and priority support. |
| **Ultra** | **$25 / month** | Everything in Pro; 1 TB Cloud Storage; infinite NANO AI credits/day (intended plan wording; production still needs model capacity and a fair-use policy); one custom domain; Proxy and VPN; one Linux server with SSH access; priority project queue, activity logs, and more advanced tools. |
| **Business** | **Customizable: $5 to $100+ / month** | Custom AI capacity, storage, website projects, Raspberry Pi connections, team seats, priority support, and dedicated deployment options; one Linux server with SSH access. Above $100/month requires a custom quote. Proxy and VPN are not included on Business. |

Every paid plan (Plus, Pro, Ultra, and Business) is intended to include one Linux server reachable over SSH. The static website does not actually provision servers or connect SSH. AI credits, storage, domains, Proxy, VPN, and server access are product features to be implemented by a production backend.
### Plan detail interaction

Click anywhere on a plan card, its details link, or a plan-view button to open the detailed plan dialog. From that dialog, a visitor can continue to the account-required signup/login flow. The Business details dialog opens the Business configurator. These account and subscription actions remain demo-only until real authentication and billing are connected.

### Proxy and VPN

The pricing page lists **Proxy access and VPN access on Pro ($10/month) and Ultra ($25/month) only**. Free, Plus, and Business do not list these features; Business is configured separately and does not inherit Ultra's feature set. These are product-plan concepts in the static demo, not functioning proxy servers or VPN endpoints. A live service would need a secure network architecture, authentication, traffic and abuse controls, privacy disclosures, operational monitoring, and clear acceptable-use rules.

### Customizable Business plan

The Business card opens an interactive customizer. The base workspace starts at **$5/month**. Optional sample add-ons are: AI capacity (+$10), more website projects (+$10), extra Raspberry Pi connections (+$15), expanded storage (+$15), team seats and roles (+$20), priority support (+$15), and dedicated deployment/advanced controls (+$25). The on-page total is only an illustrative estimate; configurations over $100/month are marked as requiring a custom quote. These prices and inclusions must be finalized before launch, and the static website does not activate plan entitlements or charge a payment method.

## Login, signup, and account flow

Although the project is one HTML file, it contains separate screens that switch inside the page using hash routes:

- `#/home` — homepage.
- `#/login` — login screen.
- `#/signup` — signup screen.
- `#/account` — demo account dashboard.
- `#/gate` — account-required prompt shown before gated actions.

The login screen has email and password fields plus **Continue with Google** and **Continue with Apple** buttons. The signup screen has name, email, password, and password-confirmation fields plus Google and Apple buttons. The visual design of the provider buttons is included, but **Google and Apple OAuth are not configured**. Clicking a provider button displays a notice that authentication is not connected.

The email/password forms also operate in demo mode only. They perform simple browser-side form checks and create temporary demo session state so a visitor can view the dashboard. They do not verify a real identity or send credentials to a server. Do not enter a real or reused password.

The account dashboard displays the demo user's first name and selected plan, and links to the AI, Pi, and hosting areas. Signing out clears the demo session. State is held in browser `sessionStorage` and is not a persistent, secure user account or server-side entitlement.

Plan cards and their detail links open a detailed plan dialog first. Visitors can review the plan features and then continue to the account-required screen before the demo login/signup flow. The Business “Customize Business” button opens its add-on selector; continuing from the selector opens the account-required flow and carries the estimated configuration along. The selected plan or feature is carried through the demo flow. This does **not** complete a checkout or activate a subscription.

## FAQ covered on the site

- **Is NANO AI live yet?** NANO AI is the product name; the current page only displays sample replies. A secure server-side AI API integration is needed.
- **Can ALLEY Cloud really SSH into my Raspberry Pi?** Not from the static page. A real implementation needs secure, authenticated remote access.
- **Will the website be hosted on my Raspberry Pi?** That is the intended use case, but production hosting depends on secure networking, uptime, bandwidth, TLS, and ISP/router constraints.
- **Do I get a domain with a paid plan?** The mockup suggests an ALLEY Cloud subdomain on Free and custom-domain connection on eligible paid plans. Domain registration versus domain connection still needs to be defined.
- **Are the prices and limits final?** No. They are sample values for the concept and should be updated before launch.

## Run the website locally

1. Download or clone this repository.
2. Keep `index.html` and `README.md` in the repository root.
3. Open `index.html` in a modern browser. No build command or package installation is needed for the visual demo.
4. Use the top navigation and buttons to explore the homepage, plan cards, login, signup, and dashboard demo.

Because the HTML is self-contained, it can also be renamed to `ALLEYCloud.html`. For GitHub Pages, the recommended filename is `index.html` in the publishing source folder.

## Publish with GitHub Pages

1. Upload `index.html` and `README.md` to the root of your GitHub repository.
2. Open the repository's **Settings → Pages**.
3. Under the build/deployment configuration, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder, then save.
5. After GitHub Pages finishes building the site, use the published URL shown in the Pages settings.

The public site will generally use a URL in the form `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`. Replace the placeholders with your GitHub username and repository name. A public repository and publicly served website should be treated as accessible to anyone.

## Production work needed before launch

This project is currently a front-end concept. Before treating it as a real cloud service, implement and test at least the following:

1. **Authentication:** secure server-side sessions, password hashing if passwords are supported, email verification, password reset, abuse protection, and account deletion. Configure Google and Apple OAuth with their provider consoles and valid redirect URLs.
2. **NANO AI integration:** server-side API calls, secret management, model selection, rate limits, quota enforcement, error handling, safety controls, and cost monitoring.
3. **SSH/Pi connections and network features:** secure device enrollment, a private tunnel or VPN architecture, any separately offered VPN/proxy service, SSH key handling, per-account authorization, short-lived access sessions, logs, abuse controls, and isolation between customers.
4. **Website hosting:** project upload/build/deployment pipeline, isolated hosting, domain validation, DNS management, TLS/HTTPS, backups, logs, and resource limits.
5. **Subscriptions:** payment provider integration, checkout, customer portal, cancellations, invoices, taxes as applicable, and a server-side plan entitlement system. A visible pricing card is not a working checkout.
6. **Operations and policies:** privacy policy, terms, acceptable-use rules, support workflow, data-retention policy, incident response, monitoring, and backup/restore testing.
7. **Final pricing:** validate plan prices, Business add-on amounts, quotas, Pi connection limits, storage allocations, support promises, and domain terms against actual operating costs and capabilities.
8. **Proxy/VPN services:** build and security-test the actual proxy and VPN infrastructure before presenting the Pro/Ultra plan features as available to customers.

## Security and accuracy notes

- Do not place API keys, OAuth client secrets, SSH private keys, passwords, or other sensitive credentials in this public HTML file.
- Do not rely on browser-only controls for authentication, plan limits, permissions, payment state, or access to a Raspberry Pi.
- Treat the AI chat and terminal previews as sample interactions only. Proxy/VPN are shown as planned Pro/Ultra benefits but are not live services.
- All pricing, AI quotas, plan entitlements, domain features, and service capabilities in the mockup require confirmation before customers are charged or promised service.

## Suggested next steps

1. Publish the static demo with GitHub Pages.
2. Decide the exact business rules and feature limits for each plan.
3. Build the backend and authentication first.
4. Connect NANO AI through the backend and add metered usage.
5. Implement secure Pi enrollment/access, then website deployment and domain management.
6. Add checkout only after the included features and billing terms are finalized.

---

**ALLEY Cloud** — a concept for bringing AI assistance, home-server access, and personal website hosting into one workspace.
