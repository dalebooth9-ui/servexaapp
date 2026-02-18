

## Fix Xero OAuth Redirect

### Root Cause

The edge function analytics reveal that `xero-oauth-callback` IS being called and returns a 302, but it redirects to a garbled URL like:
```
.../functions/v1/zRSsVD7t9upXQnykO_8wGZqfN7ruJYtWQ-gQQMthn3c5__S2/settings?xero_error=missing_params
```

This means the `APP_URL` secret is set to an incorrect value. The callback is also receiving requests without `code`/`state` parameters, suggesting Xero is hitting the callback with an error.

### Changes Required

#### 1. Fix the APP_URL Secret
Update the `APP_URL` secret to the correct published app URL:
```
https://field-aid-box.lovable.app
```

#### 2. Harden the Callback Function
Make the redirect URL more resilient by:
- Adding a fallback validation for APP_URL to catch malformed values
- Logging the actual APP_URL value being used for easier debugging
- Ensuring the redirect always goes to a sensible URL even if the secret is wrong

#### 3. Improve Error Visibility
Update the callback to include the Xero error description in the redirect when Xero returns an error, so you can see the exact failure reason on the settings page.

### Technical Details

- **File**: `supabase/functions/xero-oauth-callback/index.ts` — add URL validation for APP_URL and better error pass-through
- **Secret**: Update `APP_URL` to `https://field-aid-box.lovable.app`
- **No database changes needed**

