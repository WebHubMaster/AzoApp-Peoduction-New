// Panel-specific onboarding tour steps.
// A step targets a real UI element via a CSS selector. To stay responsive across
// the three layout shells + breakpoints, each nav step lists every possible
// testid the same menu item can render with:
//   • desktop sidebar   → [data-testid="nav-<key>"]        (PanelLayout & CustomerShell)
//   • PanelLayout mobile → [data-testid="tab-<key>"]        (bottom tab bar)
//   • CustomerShell mobile → [data-testid="m-nav-<key>"]    (bottom tab bar)
// The tour engine picks the FIRST VISIBLE match; if none is visible (e.g. the
// item lives behind the mobile "More" sheet) it shows a clean centred tooltip.

const nav = (key) =>
  `[data-testid="nav-${key}"], [data-testid="tab-${key}"], [data-testid="m-nav-${key}"]`;

export const TOUR_STEPS = {
  customer: [
    {
      title: "Welcome to AzoApp",
      body: "Let's take a quick tour of your dashboard so you know where everything is. It only takes a few seconds.",
      selector: null,
    },
    {
      title: "Book a Service",
      body: "Search for any home service — AC repair, electrician, cleaning and more — and book it in seconds.",
      selector: '[data-testid="home-search"], [data-testid="home-book-cta"], [data-testid="book-new"]',
    },
    {
      title: "My Bookings",
      body: "Track your live and past bookings, view status updates and manage each order from here.",
      selector: nav("orders"),
    },
    {
      title: "Wallet & Payments",
      body: "Check your wallet balance, refunds and your full transaction history in one place.",
      selector: nav("wallet"),
    },
    {
      title: "My Invoices",
      body: "Download GST invoices for every completed service whenever you need them.",
      selector: nav("invoices"),
    },
    {
      title: "Refer & Earn",
      body: "Invite friends to AzoApp and earn wallet rewards when they book their first service.",
      selector: nav("referral"),
    },
    {
      title: "Help & Support",
      body: "Have a question? Reach our support team anytime — we're here to help.",
      selector: nav("support"),
    },
  ],

  partner: [
    {
      title: "Welcome, Partner",
      body: "Here's a quick tour of your workspace so you can start accepting jobs and earning right away.",
      selector: null,
    },
    {
      title: "Your Dashboard",
      body: "See today's jobs, your earnings and key performance stats at a glance.",
      selector: nav("home"),
    },
    {
      title: "Job Requests",
      body: "New job requests appear here. Accept a request to start the job and earn.",
      selector: nav("jobs"),
    },
    {
      title: "Active Job",
      body: "Manage your ongoing job — navigate to the location, call the customer, and start/complete with OTP.",
      selector: nav("active"),
    },
    {
      title: "Wallet & Withdraw",
      body: "Track your earnings and withdraw your balance directly to your bank account.",
      selector: nav("wallet"),
    },
    {
      title: "Bank & KYC",
      body: "Complete your bank details and KYC verification to unlock payouts.",
      selector: nav("bankkyc"),
    },
    {
      title: "Help & Support",
      body: "Need assistance? Our support team is available whenever you need us.",
      selector: nav("support"),
    },
  ],

  merchant: [
    {
      title: "Welcome to your Merchant Panel",
      body: "Let's walk through the tools that help you bring in customers and grow your commission.",
      selector: null,
    },
    {
      title: "Business Overview",
      body: "Your home screen shows a quick overview of your business performance and stats.",
      selector: nav("overview"),
    },
    {
      title: "My Customers",
      body: "View the customers who booked services through your shop and track their activity.",
      selector: nav("customers"),
    },
    {
      title: "Scan QR",
      body: "Share your shop's QR poster so customers can book instantly — and you earn commission on every booking.",
      selector: nav("scanqr"),
    },
    {
      title: "Commission",
      body: "See the commission you've earned from bookings and your referral network.",
      selector: nav("earnings"),
    },
    {
      title: "Wallet & Withdraw",
      body: "Withdraw your earnings to your bank account quickly and securely.",
      selector: nav("wallet"),
    },
    {
      title: "Bank & KYC",
      body: "Complete your bank details and KYC to enable withdrawals.",
      selector: nav("bankkyc"),
    },
  ],

  admin: [
    {
      title: "Welcome, Admin",
      body: "A quick tour of your control center so you can manage the platform with confidence.",
      selector: null,
    },
    {
      title: "Dashboard",
      body: "Your command center — revenue, bookings, partners and live platform activity at a glance.",
      selector: nav("dashboard"),
    },
    {
      title: "Bookings",
      body: "View and manage every customer booking and follow its full lifecycle.",
      selector: nav("bookings"),
    },
    {
      title: "Live Dispatch Feed",
      body: "Watch jobs being dispatched to partners in real time as they happen.",
      selector: nav("dispatch_feed"),
    },
    {
      title: "Live Partner Map",
      body: "See where your partners are on a live map to monitor coverage and operations.",
      selector: nav("livemap"),
    },
    {
      title: "Global Search",
      body: "Jump instantly to any user, service, booking or transaction from here.",
      selector: '[data-testid="global-search"]',
    },
    {
      title: "Notifications",
      body: "Stay on top of important platform alerts and updates in real time.",
      selector: '[data-testid="notif-bell"]',
    },
  ],
};

export default TOUR_STEPS;
