# Strava to Google Sheets setup

Target spreadsheet: `1OdK4ydfb4Xb4ZFbp1KnAwLeJfxBy7EjhnzRBPblzozY`

1. Open the target Google Sheet and choose **Extensions > Apps Script**.
2. Replace the existing code with the complete latest contents of `strava-to-google-sheets.gs`.
3. Click **Save**.
4. In Strava API settings, keep **Authorization Callback Domain** set to `script.google.com`.
5. Reload the spreadsheet and use **Strava Sync > Setup Strava** if the account is not already connected.
6. In Apps Script choose **Deploy > New deployment > Web app**.
7. Set **Execute as** to **Me** and **Who has access** to **Anyone**, then deploy and approve Google permissions.
8. Reload the spreadsheet and choose **Strava Sync > Install real-time webhook**.

OAuth uses Google Apps Script's native signed callback. The Web app deployment is used only as the public Strava webhook endpoint; your client secret and OAuth tokens remain in private Script Properties.

Strava will now push activity create, update, and delete events to the sheet. The former 15-minute activity poll is removed after webhook installation. Historical best-effort scanning may continue on its own temporary trigger until complete.

Use **Strava Sync > Sync now** for a manual refresh or **Full refresh** to rebuild the activity table.
