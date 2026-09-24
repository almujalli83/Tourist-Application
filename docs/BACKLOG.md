# Product backlog — Saudi Trip (سعودي تريب)

The app is delivered service by service (Agile). Each service lives in this repository and reuses the shared
platform: i18n (ar/en), multi-currency, B2C/B2B accounts, travel-agent aggregator, and MT eVisa client.

## Sprint 1 — Tourism Package Visa (delivered)
- [x] Responsive bilingual shell (RTL/LTR), currency selector, PWA manifest
- [x] B2C / B2B registration, sign-in and profiles
- [x] Package search: origin, multi-city destinations, dates, nights per city, pax breakdown, cabin, nationality
- [x] Flight aggregation across agents (outbound, domestic legs, return) with agent names
- [x] Hotel aggregation across agents (4★+, licensed) with agent names
- [x] Optional activities (events, tours, restaurants)
- [x] Visa form per MT guide v1.7 with passport OCR (MRZ), photo processing, security and insurance questions
- [x] Privacy policy and declarations, payment, one MT submission per applicant, status tracking
- [x] Unit tests (MRZ, itinerary rules, pricing, validation, MT mapping, payment)

## Next — before go-live of Service 1
- [ ] Connect live travel-agent APIs (implement `TravelAgentProvider` per agent contract)
- [ ] MT credentials (dev → stage → production); confirm getTourismPackageStatus verb/body with MT integration team
- [ ] Call `checkOTAQuota` before search to restrict nationalities to eligible Group B countries (VTP001)
- [ ] Live payment gateway (mada / Visa / Mastercard / Apple Pay) and VAT e-invoice (ZATCA) for B2B
- [ ] Resubmission flow for CORRECTION_REQUIRED (`isResubmission=true` + packageId), cancellation (cancelTourismPackage)
- [ ] updateTravellerTravelDetails when flights change after issuance
- [x] PostgreSQL persistence (Vercel/Neon ready) and stateless signed offers
- [ ] Email notifications, audit log, admin console for agents/commissions
- [ ] Live FX rates provider

## Future services
- [ ] Tourist eVisa (standalone)
- [ ] Event booking
- [ ] Transport & mobility
- [ ] Tour guides
