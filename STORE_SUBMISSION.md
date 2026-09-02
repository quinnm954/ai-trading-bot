# TitanAI Trader — App Store & Google Play submission guide

The native projects are now committed in the repo: `ios/` (Xcode) and `android/`
(Gradle), with app icons and splash screens generated for every required size.
Compiling the signed binaries has to happen on your own machine — Apple requires
Xcode on macOS and Google Play requires a Gradle/JDK toolchain, neither of which
exists in the Lovable sandbox.

## 1. Get the project locally

1. Export to GitHub from Lovable, then `git clone` / `git pull`.
2. `npm install`
3. `npm run mobile:sync` — builds the web app and copies it into `ios/` + `android/`.

Repeat step 3 after every code change you want inside the app.

Open the native IDEs: `npm run mobile:ios` or `npm run mobile:android`.
Run on a device/emulator: `npx cap run ios` or `npx cap run android`.
For live reload against the Lovable preview: `CAP_LIVE_RELOAD=1 npx cap run android`.

## 1b. Produce the store binaries

**iOS (App Store Connect)**
1. `npm run mobile:ios` to open Xcode.
2. Signing & Capabilities → select your Apple Developer team (automatic signing).
3. Bump `CFBundleShortVersionString` / `CFBundleVersion` in `ios/App/App/Info.plist`.
4. Product → Destination "Any iOS Device", then Product → Archive → Distribute App
   → App Store Connect.

**Android (Google Play)**
1. Create an upload keystore once:
   `keytool -genkey -v -keystore titanai-upload.jks -alias titanai -keyalg RSA -keysize 2048 -validity 10000`
2. Put the keystore path/passwords in `android/keystore.properties` (git-ignored) and
   reference it from a `signingConfigs` release block in `android/app/build.gradle`.
3. Bump `versionCode` / `versionName` in `android/app/build.gradle` for every upload.
4. `cd android && ./gradlew bundleRelease` → upload
   `android/app/build/outputs/bundle/release/app-release.aab` to Play Console.

## 2. App identity (already configured)

| Item | Value |
| --- | --- |
| App name | TitanAI Trader |
| Bundle / App ID | `app.lovable.p025e3af4bc0b40b0b747d5e969349fce` |
| Web dir | `dist` |
| Theme / splash color | `#0a0a1a` |
| Orientation | Portrait |

Change the bundle ID in `capacitor.config.ts` if you want your own reverse-domain
identifier (e.g. `app.titanaitrader.mobile`) — do this **before** creating the
store listings, because bundle IDs can't be changed after first submission.

## 3. Icons & splash

Source art lives in `resources/`:

- `resources/icon.png` — 1024×1024 app icon
- `resources/splash.png` — 1920×1920 splash

Generate every required native size:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#0a0a1a' --splashBackgroundColor '#0a0a1a'
```

## 4. Store listing copy

**Subtitle / short description (30 / 80 chars)**
- iOS: `Autonomous AI crypto trading`
- Play: `AI agents trade crypto for you with strict, fee-aware risk rules.`

**Description**

> TitanAI Trader is an autonomous crypto trading assistant. Five specialised AI
> agents — Watcher, Analyst, Risk, Trader and Healer — scan the market, score
> setups, size positions and manage exits around the clock, on a fixed
> reward-to-risk framework measured net of exchange fees.
>
> • Paper trading mode with a simulated $100,000 balance — no money at risk
> • Live trading through your own exchange API keys (non-custodial: we never hold your funds)
> • Hard risk limits: max position size, daily loss cap, drawdown kill-switch
> • Trade journal, expectancy per strategy and full decision transparency
> • Notifications for fills, stop-loss events and agent alerts
>
> TitanAI Trader is a tool, not financial advice. Trading crypto is high risk and
> you can lose money. Past performance never guarantees future results.

**Category:** Finance. **Content rating:** 17+ / Mature (financial trading).

## 5. Required policies & disclosures

Already in the app (Settings → Legal & Privacy): Privacy Policy, Terms of
Service, Risk Disclosure, cookie consent. Both stores require **public URLs** —
use:

- `https://titanaitrader.app/privacy`
- `https://titanaitrader.app/terms`

Also declare:

- **Data collection:** email, account/trading data (linked to identity), used for app functionality only.
- **No custody:** the app never holds user funds; trades execute on the user's own exchange account.
- **Account deletion:** must be reachable in-app (Settings) and via a public URL.
- **Payments:** the $29/30-day access is paid in USDC directly to the operator's
  wallet outside the app. Do **not** advertise or link to that purchase flow from
  inside the native app — Apple (3.1.1) and Google both require in-app digital
  purchases to use their billing. Practical options:
  1. Ship the native app as **paper-trading + live-trading tool only**, with access
     granted from the web app, and no purchase UI or pricing link inside the binary; or
  2. Add StoreKit / Play Billing subscriptions for mobile users.
  Option 1 is fastest; the web app keeps the wallet flow untouched.

## 6. Screenshots needed

Capture on device or simulator (portrait):

- iPhone 6.7" (1290×2796) — Dashboard, Agent Console, Risk, Trade Journal, Signals
- iPad 12.9" (2048×2732) if you enable iPad
- Android phone (1080×1920+) and 1024×500 feature graphic

## 7. Build & upload

**iOS** (macOS + Xcode): `npx cap open ios` → set your Team, bump version/build →
Product → Archive → Distribute to App Store Connect → TestFlight → submit.

**Android** (Android Studio): `npx cap open android` → Build → Generate Signed
Bundle (AAB) with an upload keystore you keep safe → upload to Play Console →
internal testing → production.

## 8. Review checklist

- [ ] Demo account credentials supplied in App Review notes (paper mode)
- [ ] Risk disclaimer visible before live trading is enabled
- [ ] No purchase/pricing links inside the native binary (unless using store billing)
- [ ] Privacy policy + account deletion URLs live
- [ ] Version/build numbers incremented on every upload
