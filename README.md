# A9 Global Technologies Website & Portal

A responsive website starter for A9 Global Technologies, including a public company website, customer registration/login, service requests, product orders, training applications, and an owner-only admin dashboard.

## Company details configured
- Email: service.a9globaltechltd@gmail.com
- Phone: 07069362725
- Address: No. 5 Zaria Road, opposite Rabiu Wise, Funtua, Katsina State
- Tagline: Customer Satisfaction Is Our No. 1 Priority
- Colors: maroon, orange, white

## Run locally
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set a strong, private `SESSION_SECRET` and a unique `ADMIN_PASSWORD` in `.env`.
4. Run `npm install`.
5. Set `DATABASE_URL` to your PostgreSQL connection string (Neon pooled connection string is suitable for the app).
6. Run `npm start`.
6. Open `http://localhost:3000`.

The first admin account is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` when the app starts. **Do not share the `.env` file or the admin password.** Public sign-up can only create customer accounts.

## Features in this starter
- Public home, services, products, training, about and contact sections
- Customer sign-up and sign-in
- Customer dashboard to submit service requests, place product orders, apply for training, and track status
- Owner-only dashboard for managing requests, orders, training applications, products, service list, training intake, and payment records
- PostgreSQL database via `DATABASE_URL`; login sessions are stored in PostgreSQL too
- Password hashing, session authentication, CSRF-like same-site cookie settings, basic input validation, Helmet security headers
- Payments are recorded in person; there is no online payment integration

## Important before production
This is a working starter, not a managed hosting service. To be publicly available on the internet, it must be deployed to a server/host that supports Node.js and persistent storage. Use HTTPS, a strong session secret and admin password, regular database backups, and configure email delivery before relying on email notifications. The app requires a reachable PostgreSQL database. Keep `DATABASE_URL` private in your hosting environment settings. Test all flows and have a developer review security before accepting real customer data.

## Branding assets
The logo can be uploaded by an owner in the admin area in a later enhancement. No original logo file was available in this project package, so the company name is used as the wordmark.
