/* ---------------------------------------------------------------------------
 * partnerSim.js — self-contained mock dataset + live simulation helpers for the
 * AzoApp "Partner Operations Command Center" (Live Partner Map).
 *
 * This generates ~200 realistic partners spread across AzoApp cities with a
 * valid last-known location for EVERY partner (available, on_job, delayed, busy,
 * travelling, offline) so none are ever hidden by status. The simulation moves
 * working partners and flips statuses over time so the UI feels real.
 * ------------------------------------------------------------------------- */

export const STATUS = {
  available: { key: "available", label: "Available", color: "#22C55E", ring: "#86efac" },
  on_job: { key: "on_job", label: "On Job", color: "#3B82F6", ring: "#93c5fd" },
  travelling: { key: "travelling", label: "Travelling", color: "#0EA5E9", ring: "#7dd3fc" },
  busy: { key: "busy", label: "Busy", color: "#8B5CF6", ring: "#c4b5fd" },
  delayed: { key: "delayed", label: "Delayed", color: "#F59E0B", ring: "#fcd34d" },
  offline: { key: "offline", label: "Offline", color: "#94A3B8", ring: "#cbd5e1" },
};
export const STATUS_ORDER = ["available", "on_job", "travelling", "busy", "delayed", "offline"];
export const statusColor = (s) => (STATUS[s] || STATUS.offline).color;
export const statusLabel = (s) => (STATUS[s] || STATUS.offline).label;
export const isOnline = (s) => s !== "offline";
export const isWorking = (s) => ["on_job", "travelling", "busy", "delayed"].includes(s);

export const CITIES = [
  { name: "Patna", lat: 25.5941, lng: 85.1376, weight: 34 },
  { name: "Muzaffarpur", lat: 26.1209, lng: 85.3647, weight: 12 },
  { name: "Darbhanga", lat: 26.1542, lng: 85.8918, weight: 8 },
  { name: "Gaya", lat: 24.7955, lng: 85.0002, weight: 10 },
  { name: "Bhagalpur", lat: 25.2425, lng: 86.9842, weight: 8 },
  { name: "Samastipur", lat: 25.856, lng: 85.7868, weight: 6 },
  { name: "Begusarai", lat: 25.4182, lng: 86.1272, weight: 6 },
  { name: "Purnea", lat: 25.7771, lng: 87.4753, weight: 6 },
  { name: "Hajipur", lat: 25.6857, lng: 85.2075, weight: 6 },
  { name: "Ara", lat: 25.5541, lng: 84.6637, weight: 5 },
  { name: "Ranchi", lat: 23.3441, lng: 85.3096, weight: 10 },
  { name: "Delhi", lat: 28.6139, lng: 77.209, weight: 22 },
  { name: "Mumbai", lat: 19.076, lng: 72.8777, weight: 20 },
  { name: "Bengaluru", lat: 12.9716, lng: 77.5946, weight: 18 },
  { name: "Hyderabad", lat: 17.385, lng: 78.4867, weight: 14 },
];

export const CATEGORIES = [
  "Electrician", "Plumber", "Carpenter", "AC Repair", "Appliance Repair",
  "Cleaning", "Painter", "Men's Salon", "Women's Salon", "Pest Control",
  "RO Repair", "TV Repair", "Refrigerator Repair", "Washing Machine Repair",
];

const SERVICE_BY_CAT = {
  "Electrician": ["Switchboard Repair", "Wiring Fix", "Fan Installation", "MCB Replacement"],
  "Plumber": ["Tap Leakage", "Pipe Fitting", "Geyser Install", "Drain Cleaning"],
  "Carpenter": ["Door Repair", "Furniture Assembly", "Hinge Fix", "Cabinet Install"],
  "AC Repair": ["AC Servicing", "Gas Refill", "AC Install", "Cooling Issue"],
  "Appliance Repair": ["Microwave Fix", "Chimney Service", "Mixer Repair"],
  "Cleaning": ["Deep Cleaning", "Bathroom Cleaning", "Sofa Cleaning"],
  "Painter": ["Wall Painting", "Texture Work", "Waterproofing"],
  "Men's Salon": ["Haircut", "Shave & Trim", "Hair Spa"],
  "Women's Salon": ["Facial", "Waxing", "Hair Styling"],
  "Pest Control": ["Cockroach Control", "Termite Treatment", "Bed Bugs"],
  "RO Repair": ["Filter Change", "RO Service", "Membrane Fix"],
  "TV Repair": ["Panel Issue", "No Display Fix", "Sound Repair"],
  "Refrigerator Repair": ["Cooling Fix", "Compressor Check", "Gas Charging"],
  "Washing Machine Repair": ["Drum Repair", "Motor Fix", "Water Leakage"],
};

const FIRST = ["Raj", "Amit", "Suresh", "Vikas", "Pawan", "Ravi", "Manoj", "Sunil", "Deepak", "Ajay",
  "Rohit", "Sanjay", "Vinod", "Arun", "Nitin", "Gaurav", "Alok", "Rakesh", "Dinesh", "Sachin",
  "Priya", "Neha", "Pooja", "Anjali", "Kavita", "Sneha", "Rekha", "Meena", "Shweta", "Divya"];
const LAST = ["Kumar", "Singh", "Verma", "Sharma", "Yadav", "Gupta", "Prasad", "Das", "Mishra", "Thakur",
  "Pandey", "Choudhary", "Jha", "Roy", "Sinha", "Paswan", "Mahto", "Raut", "Nayak", "Reddy"];
const CUSTOMERS = ["Priya Verma", "Anil Kapoor", "Sunita Devi", "Rahul Nair", "Megha Jain", "Imran Khan",
  "Karan Mehta", "Pooja Rao", "Vikram Shah", "Neha Gupta", "Sameer Bose", "Lata Iyer"];

let _seq = 1;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (n, l) => String(n).padStart(l, "0");

function weightedCity() {
  const total = CITIES.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CITIES) { r -= c.weight; if (r <= 0) return c; }
  return CITIES[0];
}

function buildJob(category) {
  const started = Date.now() - Math.floor(rand(5, 55)) * 60000;
  return {
    service: pick(SERVICE_BY_CAT[category] || ["Service Visit"]),
    bookingCode: `AZ${pad(Math.floor(rand(1000, 9999)), 4)}${pick(["F2C", "A1B", "9XK", "7QP", "3ZR"])}`,
    customer: pick(CUSTOMERS),
    startedAt: started,
    etaMin: Math.floor(rand(8, 35)),
    promisedMin: Math.floor(rand(12, 25)),
    distanceKm: Number(rand(1.2, 9).toFixed(1)),
    // customer sits a short hop from the partner
    custOffset: { dlat: rand(-0.02, 0.02), dlng: rand(-0.02, 0.02) },
  };
}

function makePartner(statusBias) {
  const city = weightedCity();
  const category = pick(CATEGORIES);
  const extra = Math.random() < 0.4 ? [pick(CATEGORIES)] : [];
  const categories = Array.from(new Set([category, ...extra]));
  const status = statusBias || pick(STATUS_ORDER);
  const lat = city.lat + rand(-0.09, 0.09);
  const lng = city.lng + rand(-0.09, 0.09);
  const online = status !== "offline";
  const working = isWorking(status);
  const job = working ? buildJob(category) : null;
  if (status === "delayed" && job) { job.etaMin = job.promisedMin + Math.floor(rand(8, 22)); }
  const id = `p${_seq}`;
  const idx = _seq;
  _seq += 1;
  return {
    id,
    partnerId: `AZP${pad(1000 + idx, 4)}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    phone: `+91 ${pad(Math.floor(rand(60000, 99999)), 5)} ${pad(Math.floor(rand(10000, 99999)), 5)}`,
    avatar: `https://i.pravatar.cc/120?img=${(idx % 70) + 1}`,
    category,
    categories,
    city: city.name,
    cityCenter: { lat: city.lat, lng: city.lng },
    status,
    online,
    lat, lng,
    heading: rand(0, Math.PI * 2),
    rating: Number(rand(3.8, 5).toFixed(1)),
    completedJobs: Math.floor(rand(40, 1800)),
    todayJobs: Math.floor(rand(0, 9)),
    todayEarnings: Math.floor(rand(0, 4200)),
    onlineSince: Date.now() - Math.floor(rand(20, 420)) * 60000,
    coverageRadiusKm: Number(rand(3, 8).toFixed(1)),
    lastUpdate: status === "offline" ? Date.now() - Math.floor(rand(2, 40)) * 60000 : Date.now() - Math.floor(rand(0, 20)) * 1000,
    activeJob: job,
  };
}

export function generatePartners(n = 200) {
  _seq = 1;
  const out = [];
  // guarantee a healthy mix across every status
  const bias = [
    ...Array(Math.round(n * 0.4)).fill("available"),
    ...Array(Math.round(n * 0.22)).fill("on_job"),
    ...Array(Math.round(n * 0.09)).fill("travelling"),
    ...Array(Math.round(n * 0.08)).fill("busy"),
    ...Array(Math.round(n * 0.07)).fill("delayed"),
    ...Array(Math.round(n * 0.14)).fill("offline"),
  ];
  for (let i = 0; i < n; i += 1) out.push(makePartner(bias[i] || undefined));
  return out;
}

/* Produce one simulation tick: moves working partners along their heading and
   occasionally flips a single partner's status. Returns { partners, events }. */
export function simulateTick(prev) {
  const events = [];
  const now = Date.now();
  const next = prev.map((p) => {
    const q = { ...p };
    if (q.online && isWorking(q.status)) {
      // ~120–180m hop; small occasional heading drift so paths curve naturally
      q.heading += rand(-0.3, 0.3);
      const step = rand(0.0009, 0.0016);
      q.lat += Math.sin(q.heading) * step;
      q.lng += Math.cos(q.heading) * step;
      q.lastUpdate = now;
      if (q.activeJob) {
        q.activeJob = { ...q.activeJob, etaMin: Math.max(1, q.activeJob.etaMin - (Math.random() < 0.5 ? 1 : 0)) };
      }
    } else if (q.online) {
      q.lastUpdate = now;
    }
    return q;
  });

  // flip ~1 partner's status each tick for a lively feel
  if (Math.random() < 0.85 && next.length) {
    const i = Math.floor(Math.random() * next.length);
    const p = { ...next[i] };
    const transitions = {
      available: ["on_job", "offline", "busy"],
      on_job: ["delayed", "available", "travelling"],
      travelling: ["on_job", "available"],
      busy: ["available", "on_job"],
      delayed: ["available", "on_job"],
      offline: ["available"],
    };
    const to = pick(transitions[p.status] || ["available"]);
    const from = p.status;
    p.status = to;
    p.online = to !== "offline";
    p.lastUpdate = now;
    if (isWorking(to) && !p.activeJob) p.activeJob = buildJob(p.category);
    if (to === "delayed" && p.activeJob) p.activeJob = { ...p.activeJob, etaMin: p.activeJob.promisedMin + Math.floor(rand(8, 20)) };
    if (!isWorking(to)) p.activeJob = null;
    next[i] = p;
    const verb = {
      available: "is now Available", on_job: "accepted a job", travelling: "is travelling",
      busy: "is now Busy", delayed: "is running late", offline: "went Offline",
    }[to];
    events.push({ id: p.id, name: p.name, from, to, text: `${p.name} ${verb}` });
  }
  return { partners: next, events };
}

export function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
}

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
