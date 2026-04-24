# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Required secrets — WhatsApp & Email functions

These edge functions return **HTTP 503** with `{ "error": "missing_configuration", "missing": [...] }` until every secret below is set.

### WhatsApp (Twilio)
Used by `send-whatsapp` and `whatsapp-webhook`:

| Secret | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (signs/validates requests) |
| `TWILIO_WHATSAPP_NUMBER` | Sender number in E.164 format (e.g. `+14155238886`) |

### Email (Resend via Lovable AI Gateway)
Used by `send-engineer-onboarding`, `send-test-reminder`, `send-weekly-report`, and `test-resend-email`:

| Secret | Purpose |
|---|---|
| `LOVABLE_API_KEY` | Authenticates calls to the Lovable connector gateway |
| `RESEND_API_KEY` | Resend connection key used by the gateway |

### Where to add them
In the Lovable editor, open **Cloud → Secrets** (or press **⌘K / Ctrl+K** and search for "Secrets"), click **Add secret**, paste the name exactly as shown above plus the value, and save. Edge functions pick up new values on their next invocation — no redeploy required.
