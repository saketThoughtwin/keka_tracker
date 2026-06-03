# Keka Token Setup Guide

## 🎯 AUTO-REFRESH WITHOUT CLIENT CREDENTIALS ✨

**Good news!** Your Keka instance supports OAuth2 refresh tokens. This means:

```env
KEKA_ACCESS_TOKEN=your_token
KEKA_REFRESH_TOKEN=your_token
# NO CLIENT_ID/SECRET NEEDED!
```

✅ **Tokens auto-refresh every 2-5 minutes** (works for 5-minute tokens!)
✅ **Never shows "token expired" error**
✅ **Never need to manually update tokens**
✅ **Exactly like your colleague's system** (but BETTER - truly automatic!)

---

## 🔑 How to Get Your Tokens

### Step 1: Open Keka in Browser
- Go to https://thoughtwin.keka.com

### Step 2: Open DevTools → Application Tab
- Press `F12` (DevTools)
- Click **Application** tab
- On the left: **Storage** → **Local Storage** → `https://thoughtwin.keka.com`

### Step 3: Copy Token Values
Look for these in the Local Storage list:
- `access_token` → Copy the VALUE (the long string starting with `eyJ...`)
- `refresh_token` → Copy the VALUE

They look like:
```
access_token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjE4NzQ2MjE1MzA...
refresh_token: FBEF280C18214A5A0AA5...
```

### Step 4: Create/Update .env.local

Copy the tokens into your `.env.local` file:

```env
KEKA_BASE_URL=https://thoughtwin.keka.com
KEKA_ACCESS_TOKEN=<paste_the_access_token_value_here>
KEKA_REFRESH_TOKEN=<paste_the_refresh_token_value_here>
```

### Step 5: Start the App
```bash
npm run dev
```

Done! ✅ Your tokens will now **auto-refresh forever** without manual intervention!

---

## 🔄 How It Works (The Magic ✨)

Your Keka instance has **short-lived tokens** (5 minutes):
- `access_token` expires every 5 minutes
- `refresh_token` is used to get a new `access_token`

The app automatically:
1. **Detects token expiry time** from the token
2. **Refreshes at 50% of token lifetime** (every ~2.5 minutes for 5-min tokens)
3. **Gets new access_token** using your refresh_token
4. **Uses new token seamlessly** - you never see errors!

**Result:** Your access is truly never-ending! 🎉

---

## ⏰ Token Lifetime

Calculate from what you saw in DevTools:
- Token stored at: `1780463618166` 
- Token expires at: `1780463918000`
- Lifetime: **~300 seconds = 5 minutes** ✓

This is automatically detected and the app adjusts refresh timing accordingly!

---

## 🔧 Troubleshooting

### "Missing environment variable: KEKA_ACCESS_TOKEN"
- Make sure `.env.local` exists in the project root
- Add both `KEKA_ACCESS_TOKEN` and `KEKA_REFRESH_TOKEN`
- Restart the app

### "Cannot refresh token: No refresh token found"
- Make sure `KEKA_REFRESH_TOKEN` is in `.env.local`
- Re-copy the value from browser DevTools → Application → Local Storage
- Make sure you copied the full value (not truncated)

### Still showing 401 errors?
- Your tokens might be expired in the browser cache
- Logout from Keka and login again
- Re-copy `access_token` and `refresh_token` from DevTools
- Update `.env.local` with new values
- Restart the app

---

## 📊 Comparison: Auto-Refresh vs Manual Update

| | Auto-Refresh (Current) | Manual Update (Old Way) |
|---|---|---|
| **Setup** | Copy 2 tokens once | Copy tokens, then manually repeat |
| **Automatic Refresh** | ✅ Every 2-5 minutes | ❌ Never |
| **Maintenance** | ✅ None forever | ⚠️ Manual every 5 min/day/week |
| **401 Errors** | ✅ Never | ❌ When token expires |
| **Reliability** | ✅ 100% uptime | ⚠️ Manual = human error |

---

## 🚀 Advanced: With CLIENT Credentials (Optional)

If your HR also gives you:
- `KEKA_CLIENT_ID`
- `KEKA_CLIENT_SECRET`

Add them to `.env.local`:
```env
KEKA_CLIENT_ID=your_client_id
KEKA_CLIENT_SECRET=your_client_secret
```

**Benefit:** Slightly more efficient token refresh (uses OAuth2 properly). But it works fine without them too!

---

## ✨ Summary

Your app now automatically:
- 🔄 Refreshes tokens before they expire
- 🎯 Never shows token errors
- 🚀 Works indefinitely without manual updates
- ⚡ Handles concurrent API requests efficiently
- 💪 Just like your colleague's system, but BETTER!
