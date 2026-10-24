# Halo — NFC social profiles

A small, beginner-friendly static site for NFC cards and shareable social profiles. The public pages are made with plain HTML, CSS, and JavaScript. Supabase handles admin sign-in, profile data, and photos.

## What is here

- A responsive dark-purple glass profile and pastel social buttons.
- A public landing page and individual profile pages at `?p=your-slug`.
- An admin sign-in and profile manager. Admins can create, edit, publish, and delete profiles, choose a theme color, upload a photo, and add social links.
- Supabase Row Level Security policies in [`supabase/setup.sql`](supabase/setup.sql).
- A GitHub Pages workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

The page shows an Alex Morgan sample profile until Supabase is connected. That sample is only a preview; it is not stored in Supabase or publicly published.

## 1. Connect your Supabase project

1. Open the Supabase project you created for this site.
2. In **Project Settings → API Keys**, copy the **Project URL** and the **Publishable key** (`sb_publishable_…`). The publishable key is designed for browser use when RLS is configured. Never copy a secret key or `service_role` key into this site.
3. Open [`app.js`](app.js). At the top, replace `YOUR_PROJECT_REF` and `YOUR_SUPABASE_PUBLISHABLE_KEY` with those two public values. Keep the quotes around each value.
4. **If you already created the tables and policies for this project, do not run the setup SQL again.** The local website has been adjusted to use the existing `profiles` and `admin_users` columns that you checked. Keep `supabase/setup.sql` as a reference for a brand-new Supabase project only; inspect it before running it anywhere.

The website uses Supabase's browser-safe publishable key. Never put a secret or `service_role` key in `app.js`.

## 2. Add the first administrator

1. In Supabase, open **Authentication → Users** and create the admin account with an email and password.
2. Copy that account's **User UID**.
3. In the SQL Editor, run this statement with the real UID:

   ```sql
   insert into public.admin_users (user_id)
   values ('PASTE-THE-ADMIN-USER-UUID-HERE');
   ```

Only accounts listed in `admin_users` can manage profile data or upload/delete photos. A successful sign-in alone does not grant admin access. Keep account creation in the Supabase dashboard; the public site intentionally has no sign-up form.

## 3. Run the site locally

Serve this folder with a local static server (for example, VS Code's Live Server extension). Open its local address in a browser. Do not open `index.html` as a `file://` page; browser modules and Supabase requests need a local web server.

Before deployment, add your test and production site addresses to **Authentication → URL Configuration → Redirect URLs** in Supabase. The login uses email/password and normally stays on the same page, but adding the deployed origin is useful for the Auth allow-list.

## 4. Publish with GitHub Pages

1. Make sure the two public Supabase values are set in `app.js` and the SQL and first admin setup are complete.
2. In the GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Push the site files to the repository's `main` branch. The included workflow publishes this static site; check the **Actions** tab for its result.
5. The site address will be `https://clarkmarupok.github.io/nfc-social-profiles/` (GitHub may take a few minutes to publish it).

Profile links use the query-string slug, for example `https://clarkmarupok.github.io/nfc-social-profiles/?p=alex-morgan`. This format works on GitHub Pages without extra rewrite setup. Keep slugs stable after sharing them; the database also blocks slug changes.

For another free static host, upload the folder to Netlify or Cloudflare Pages and add that site's origin in Supabase Auth URL Configuration. No server or build step is required.

## Profile editor notes

- Public profile pages only load profiles with **Published** enabled. Drafts can only be seen by admins in the dashboard.
- Slugs are generated from the name by default and become permanent when saved. Pick one you want to keep before creating a profile.
- Add social links one per line, in the form `Label, https://...`. `http`, `https`, `mailto`, and `tel` links are supported.
- Photos must be JPG, PNG, or WebP and at most 2 MB. The existing `profile-photos` bucket controls the same limits.
- The browser only contains the Supabase Project URL and publishable key. Never add a secret or service-role key to frontend files, GitHub Pages settings, or this repository.

## Troubleshooting

- **“Could not verify admin access”** — do not rerun setup SQL on your existing project. Check that the signed-in account's Auth UID has a row in `public.admin_users`, and that the `profiles` and `admin_users` RLS policies are enabled.
- **Profile list is empty** — confirm the signed-in account appears in `admin_users` and the browser console shows no Supabase connection error.
- **Image upload is rejected** — confirm the bucket is named `profile-photos`, the file is under 2 MB, and Storage policies from the SQL are present. Existing bucket access policies can be reviewed under **Storage → Policies**.
- **The page cannot connect to Supabase** — confirm the Project URL and publishable key in `app.js`, and that the project is active.
- **Published profile says not found** — check that the slug is correct and **Published** is enabled.

## Security and data

RLS protects the database even if someone skips the admin interface. The private `is_admin()` helper checks `admin_users`; public visitors can only read published profile rows. The restrictive Storage policy adds an admin-only gate for `profile-photos` writes, including when another permissive policy already exists. The bucket is public for image display, so anyone with an uploaded image URL can view that image.
