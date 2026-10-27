# Sign-up, separate lists and limits

Anyone with the link can make their own list. Each list is private to the person who made it and the one partner they add.

## How it works
- Sign-up is open: no invite code. The "New here?" tab on the sign-in screen sends an email link (same flow as sign-in).
- First sign-in lands on the Welcome screen (`src/screens/Setup.tsx`). It calls `create_household` and creates the starter groups the person picked (`src/lib/starters.ts`).
- Lists are separated by row-level security: every policy uses `is_household_member(household_id)`. `supabase/tests/rls_test.sql` proves a stranger sees nothing.
- One list per person: `create_household` refuses with "You already have a list." if the caller is already a member.

## Limits per list
Enforced by before-insert triggers in `supabase/migrations/0008_limits.sql`. The app shows the database message in a toast.

| What | Cap |
|---|---|
| People | 300 |
| Gifts | 2,000 |
| Groups | 30 |
| Families | 100 |
| Gifts with a photo | 200 |

Photos are also limited by the `gift-photos` bucket: 5 MB, JPEG/WebP/PNG. The app resizes to 1200 px before upload. To change a cap, add a new migration and update this table.

## Dashboard setup (only the project owner can do this)
Supabase's built-in email is tiny (a few emails per hour) and meant for testing. Before sharing widely:

1. **Email service.** Make a free account with an email service such as Resend. Verify a sending domain, or at least a sender address.
2. **SMTP.** Supabase dashboard, Authentication, Emails, SMTP Settings: turn on custom SMTP, paste the host, port, username and password from the email service, sender name "Gift-List".
3. **Rate limit.** Authentication, Rate Limits: raise "emails sent per hour" (for example to 100).
4. **Friendlier email.** Authentication, Emails, Templates, "Magic Link". Suggested subject: `Your Gift-List sign-in link`. Suggested body:
   ```html
   <h2>Ho ho hello!</h2>
   <p>Tap the button to open your Gift-List.</p>
   <p><a href="{{ .ConfirmationURL }}">Open my Gift-List</a></p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   ```
   Do the same for the "Confirm signup" template.
5. **Leaked passwords.** Authentication, Sign In / Providers (or Attack Protection): turn on leaked-password protection.
6. **Optional CAPTCHA.** Since sign-up is open, turn on Cloudflare Turnstile under Attack Protection. This also needs the site key added to the sign-in screen, so ask for it as its own change.
7. **Check.** Sign in with a second email address. It should get the new email, land on Welcome, and not see the first list.

## Pitfalls
- Never put the service role key in the app or git; only the anon key belongs in the frontend.
- Secrets pasted with stray spaces caused trouble before; trim them.
- Make sure the Supabase URL configuration lists the site URL `https://gon3tom-32.github.io/Gift-List/` or links will go to the wrong place.
