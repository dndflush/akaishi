/* ================================
   Akaishi Contracting — script.js
   Sign-in: Google Identity Services (GIS). Client-side only — there is
   no server here to verify tokens, so this is convenience-level auth,
   not a security boundary. See README.md for what that means and how
   to upgrade it later if you want real server-side verification.

   Data: Firebase Firestore. Bookings & applications are shared across
   everyone who visits the site (not just the browser that submitted
   them), and the admin dashboard reads live from the same database.

   Because there's no server, Firestore's security rules (firestore.rules)
   are intentionally open — anyone can read/write these two collections.
   That's the direct consequence of a fully static, serverless deploy.
   ================================ */

import { firebaseConfig, GOOGLE_CLIENT_ID, ADMIN_EMAIL } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const bookingsCol = collection(db, "bookings");
const applicationsCol = collection(db, "applications");

const STORAGE_KEYS = { user: "akaishi_user" };

/* ---------- Utilities ---------- */

function initials(name) {
  if (!name) return "?";
  const parts = name.replace(/[^a-zA-Z0-9 _-]/g, "").trim().split(/[\s_-]+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- Auth (Google Identity Services) ---------- */

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.user));
  } catch (e) {
    return null;
  }
}

function displayName(user) {
  if (!user) return "";
  return user.name || user.email || "";
}

// Identity tokens from GIS are JWTs. We only need to read the payload
// (email/name/picture/sub) — there's no server here to verify the
// signature, which is the fundamental limitation of a static-only
// deploy. See README.md if you want that verified for real later.
function decodeJwt(token) {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(json);
}

function handleCredentialResponse(response) {
  const payload = decodeJwt(response.credential);
  const user = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.cancel();
  renderAll();
}

let gisReady = false;
function initGoogleSignIn() {
  if (!window.google || !google.accounts || !google.accounts.id) {
    setTimeout(initGoogleSignIn, 150);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: false,
  });
  gisReady = true;
}

function loginWithGoogle() {
  if (!gisReady) {
    showToast("Google Sign-In is still loading — try again in a moment.");
    initGoogleSignIn();
    return;
  }
  google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed && notification.isNotDisplayed()) {
      showToast("Your browser blocked the sign-in prompt. Check pop-up/third-party cookie settings.");
    } else if (notification.isSkippedMoment && notification.isSkippedMoment()) {
      showToast("Sign-in was dismissed. Click again to retry.");
    }
  });
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.user);
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
  renderAll();
}

// Client-side only — see file header. Anyone can flip this in devtools;
// it just controls what the UI *shows*, not what data is reachable.
function looksLikeAdmin(user) {
  return !!(user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

/* ---------- Firestore data access ---------- */

async function getBookings() {
  const snap = await getDocs(query(bookingsCol, orderBy("submittedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function addBooking(booking) {
  await addDoc(bookingsCol, booking);
}
async function updateBookingStatus(id, status) {
  await updateDoc(doc(db, "bookings", id), { status });
}

async function getApplications() {
  const snap = await getDocs(query(applicationsCol, orderBy("submittedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function addApplication(application) {
  await addDoc(applicationsCol, application);
}
async function updateApplicationStatus(id, status) {
  await updateDoc(doc(db, "applications", id), { status });
}

/* ---------- Nav rendering (runs on every page) ---------- */

function renderNav() {
  const user = getUser();
  const admin = looksLikeAdmin(user);
  const loggedOutBlocks = document.querySelectorAll('[data-auth="out"]');
  const loggedInBlocks = document.querySelectorAll('[data-auth="in"]');
  const adminBlocks = document.querySelectorAll('[data-auth="admin"]');

  loggedOutBlocks.forEach((el) => (el.style.display = user ? "none" : ""));
  loggedInBlocks.forEach((el) => (el.style.display = user ? "" : "none"));
  adminBlocks.forEach((el) => (el.style.display = admin ? "" : "none"));

  if (user) {
    document.querySelectorAll("[data-user-initials]").forEach((el) => {
      el.textContent = initials(displayName(user));
    });
    document.querySelectorAll("[data-user-name]").forEach((el) => {
      el.textContent = displayName(user);
    });
  }

  document.querySelectorAll("[data-logout]").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", logout);
  });
  document.querySelectorAll("[data-login]").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", loginWithGoogle);
  });

  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === current) a.classList.add("active");
  });
}

/* ---------- Toast ---------- */

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      <span class="toast-msg"></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector(".toast-msg").textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* ---------- Request-a-contract form ---------- */

function initRequestForm() {
  const form = document.getElementById("contract-form");
  if (!form) return;

  const user = getUser();
  const gate = document.getElementById("login-gate");
  const wrap = document.getElementById("form-wrap");
  if (!user) {
    if (gate) gate.style.display = "";
    if (wrap) wrap.style.display = "none";
    return;
  } else {
    if (gate) gate.style.display = "none";
    if (wrap) wrap.style.display = "";
  }

  if (form.dataset.bound) return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.minecraftUsername || !data.projectTitle || !data.description) {
      showToast("Please fill in all required fields");
      return;
    }

    const booking = {
      serviceType: data.serviceType,
      minecraftUsername: data.minecraftUsername,
      projectTitle: data.projectTitle,
      description: data.description,
      location: data.location || "",
      contactEmail: data.contactEmail || "",
      budget: data.budget || "",
      deadline: data.deadline || "",
      status: "pending",
      submittedById: user.id,
      submittedByName: displayName(user),
      submittedAt: new Date().toISOString(),
    };

    try {
      await addBooking(booking);
      showToast("Contract request submitted!");
      form.reset();
      setTimeout(() => (location.href = "my-bookings.html"), 700);
    } catch (err) {
      console.error(err);
      showToast("Couldn't submit — check your connection and try again.");
    }
  });
}

/* ---------- Job application form ---------- */

const POSITION_LABELS = {
  builder: "Builder",
  redstone: "Redstone Engineer",
  landscaper: "Landscaper",
  architect: "Architect / Designer",
  "project-manager": "Project Manager",
  support: "Community Support",
  other: "Other",
};

function initApplyForm() {
  const form = document.getElementById("application-form");
  if (!form) return;

  const user = getUser();
  const gate = document.getElementById("login-gate");
  const wrap = document.getElementById("form-wrap");
  if (!user) {
    if (gate) gate.style.display = "";
    if (wrap) wrap.style.display = "none";
    return;
  } else {
    if (gate) gate.style.display = "none";
    if (wrap) wrap.style.display = "";
  }

  if (form.dataset.bound) return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.minecraftUsername || !data.discordUsername || !data.skills || !data.whyJoin) {
      showToast("Please fill in all required fields");
      return;
    }

    const application = {
      position: data.position,
      minecraftUsername: data.minecraftUsername,
      discordUsername: data.discordUsername,
      availability: data.availability || "",
      skills: data.skills,
      experience: data.experience || "",
      whyJoin: data.whyJoin,
      status: "pending",
      submittedById: user.id,
      submittedByName: displayName(user),
      submittedByEmail: user.email || "",
      submittedAt: new Date().toISOString(),
    };

    try {
      await addApplication(application);
      showToast("Application submitted!");
      form.reset();
      setTimeout(() => (location.href = "my-applications.html"), 700);
    } catch (err) {
      console.error(err);
      showToast("Couldn't submit — check your connection and try again.");
    }
  });
}

/* ---------- My applications page ---------- */

async function initMyApplications() {
  const list = document.getElementById("applications-list");
  if (!list) return;

  const user = getUser();
  const gate = document.getElementById("login-gate");

  if (!user) {
    if (gate) gate.style.display = "";
    list.style.display = "none";
    return;
  }
  if (gate) gate.style.display = "none";
  list.style.display = "";
  list.innerHTML = `<div class="empty-state"><p>Loading…</p></div>`;

  const all = await getApplications();
  const mine = all.filter((a) => a.submittedById === user.id);

  if (mine.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="gate-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h3>No applications yet</h3>
        <p>Submit an application and it'll show up here.</p>
        <a class="btn btn-primary" href="apply.html">Apply to Join</a>
      </div>`;
    return;
  }

  list.innerHTML = mine
    .map(
      (a) => `
    <div class="booking-card">
      <div class="booking-top">
        <div>
          <h3>${POSITION_LABELS[a.position] || a.position}</h3>
          <div class="meta">Applied ${timeAgo(a.submittedAt)}</div>
        </div>
        ${statusPillHtml(a.status)}
      </div>
      <p class="booking-desc">${escapeHtml(a.whyJoin)}</p>
      <div class="booking-tags">
        <span class="mini-tag">🧱 ${escapeHtml(a.minecraftUsername)}</span>
        <span class="mini-tag">💬 ${escapeHtml(a.discordUsername)}</span>
        ${a.availability ? `<span class="mini-tag">🕒 ${escapeHtml(a.availability)}</span>` : ""}
      </div>
    </div>`
    )
    .join("");
}

/* ---------- My bookings page ---------- */

const SERVICE_LABELS = {
  infrastructure: "Infrastructure",
  residential: "Residential Builds",
  commercial: "Commercial Builds",
  landscaping: "Landscaping",
  government: "Government Projects",
  custom: "Custom Projects",
};

function statusPillHtml(status) {
  const labels = { pending: "Pending", reviewing: "Reviewing", accepted: "Accepted", rejected: "Rejected" };
  return `<span class="status-pill ${status}">${labels[status] || status}</span>`;
}

async function initMyBookings() {
  const list = document.getElementById("bookings-list");
  if (!list) return;

  const user = getUser();
  const gate = document.getElementById("login-gate");

  if (!user) {
    if (gate) gate.style.display = "";
    list.style.display = "none";
    return;
  }
  if (gate) gate.style.display = "none";
  list.style.display = "";
  list.innerHTML = `<div class="empty-state"><p>Loading…</p></div>`;

  const all = await getBookings();
  const mine = all.filter((b) => b.submittedById === user.id);

  if (mine.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="gate-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18M3 5h18v14H3z"/></svg>
        </div>
        <h3>No contracts yet</h3>
        <p>Submit a request and it'll show up here.</p>
        <a class="btn btn-primary" href="request.html">Request a Contract</a>
      </div>`;
    return;
  }

  list.innerHTML = mine
    .map(
      (b) => `
    <div class="booking-card">
      <div class="booking-top">
        <div>
          <h3>${escapeHtml(b.projectTitle)}</h3>
          <div class="meta">${SERVICE_LABELS[b.serviceType] || b.serviceType} &middot; Submitted ${timeAgo(b.submittedAt)}</div>
        </div>
        ${statusPillHtml(b.status)}
      </div>
      <p class="booking-desc">${escapeHtml(b.description)}</p>
      <div class="booking-tags">
        <span class="mini-tag">🧱 ${escapeHtml(b.minecraftUsername)}</span>
        ${b.location ? `<span class="mini-tag">📍 ${escapeHtml(b.location)}</span>` : ""}
        ${b.budget ? `<span class="mini-tag">💰 ${escapeHtml(b.budget)}</span>` : ""}
        ${b.deadline ? `<span class="mini-tag">📅 ${formatDate(b.deadline)}</span>` : ""}
      </div>
    </div>`
    )
    .join("");
}

/* ---------- Admin dashboard ---------- */
//
// The dashboard is only for ADMIN_EMAIL. This check is client-side only
// (see file header) — treat the dashboard as a convenience view, not an
// access-controlled system, unless you add real server-side auth later.

async function initDashboard() {
  const table = document.getElementById("dashboard-table");
  if (!table) return;

  const gate = document.getElementById("admin-gate");
  const deniedEl = document.getElementById("admin-denied");
  const app = document.getElementById("dashboard-app");

  const signOutBtn = document.getElementById("admin-signout");
  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.dataset.bound = "1";
    signOutBtn.addEventListener("click", () => logout());
  }

  const viewSelect = document.getElementById("dashboard-view");
  if (viewSelect && !viewSelect.dataset.bound) {
    viewSelect.dataset.bound = "1";
    viewSelect.addEventListener("change", () => {
      const contractsView = document.getElementById("view-contracts");
      const applicationsView = document.getElementById("view-applications");
      const showApps = viewSelect.value === "applications";
      if (contractsView) contractsView.style.display = showApps ? "none" : "";
      if (applicationsView) applicationsView.style.display = showApps ? "" : "none";
    });
  }

  const showGate = () => {
    gate.style.display = "";
    if (deniedEl) deniedEl.style.display = "none";
    app.style.display = "none";
  };
  const showDenied = () => {
    gate.style.display = "none";
    if (deniedEl) deniedEl.style.display = "";
    app.style.display = "none";
  };
  const showApp = async () => {
    gate.style.display = "none";
    if (deniedEl) deniedEl.style.display = "none";
    app.style.display = "";
    await renderDashboard();
    await renderApplicationsDashboard();
  };

  const user = getUser();
  if (!user) {
    showGate();
    return;
  }
  if (looksLikeAdmin(user)) await showApp();
  else showDenied();
}

let activeFilter = "all";

async function renderDashboard() {
  const tbody = document.querySelector("#dashboard-table tbody");
  if (!tbody) return;
  const all = await getBookings();

  const counts = { pending: 0, reviewing: 0, accepted: 0, rejected: 0 };
  all.forEach((b) => (counts[b.status] = (counts[b.status] || 0) + 1));
  const setStat = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setStat("stat-total", all.length);
  setStat("stat-pending", counts.pending || 0);
  setStat("stat-reviewing", counts.reviewing || 0);
  setStat("stat-accepted", counts.accepted || 0);

  const filtered = activeFilter === "all" ? all : all.filter((b) => b.status === activeFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dimmer); padding:40px;">No contract requests${activeFilter !== "all" ? " with this status" : " yet"}.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (b) => `
    <tr>
      <td>
        <div class="cell-title">${escapeHtml(b.projectTitle)}</div>
        <div class="cell-sub">${SERVICE_LABELS[b.serviceType] || b.serviceType}</div>
      </td>
      <td>
        <div class="cell-title">${escapeHtml(b.minecraftUsername)}</div>
        <div class="cell-sub">${escapeHtml(b.contactEmail || "")}</div>
      </td>
      <td>${escapeHtml(b.location) || "—"}</td>
      <td>${escapeHtml(b.budget) || "—"}</td>
      <td>${b.deadline ? formatDate(b.deadline) : "—"}</td>
      <td>
        <div class="cell-title">${formatDate(b.submittedAt)}</div>
        <div class="cell-sub">${timeAgo(b.submittedAt)}</div>
      </td>
      <td>
        <select class="status-select" data-id="${b.id}">
          <option value="pending" ${b.status === "pending" ? "selected" : ""}>Pending</option>
          <option value="reviewing" ${b.status === "reviewing" ? "selected" : ""}>Reviewing</option>
          <option value="accepted" ${b.status === "accepted" ? "selected" : ""}>Accepted</option>
          <option value="rejected" ${b.status === "rejected" ? "selected" : ""}>Rejected</option>
        </select>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      try {
        await updateBookingStatus(id, e.target.value);
        showToast("Status updated");
        await renderDashboard();
      } catch (err) {
        console.error(err);
        showToast("Couldn't update status — try again.");
      }
    });
  });
}

function initFilterTabs() {
  const tabs = document.querySelectorAll(".contract-filter-tab");
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeFilter = tab.getAttribute("data-filter");
      renderDashboard();
    });
  });
}

/* ---------- Application detail modal ---------- */

function openApplicationModal(a) {
  const overlay = document.getElementById("app-modal");
  const content = document.getElementById("app-modal-content");
  if (!overlay || !content) return;

  content.innerHTML = `
    <div class="modal-head">
      <div>
        <h3>${POSITION_LABELS[a.position] || a.position}</h3>
        <div class="meta">Applied ${formatDate(a.submittedAt)} &middot; ${timeAgo(a.submittedAt)}</div>
      </div>
      <button class="modal-close" id="app-modal-close" title="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="modal-tags">
      <span class="mini-tag">🔑 ${escapeHtml(a.submittedByEmail) || "unknown account"}</span>
      <span class="mini-tag">🧱 ${escapeHtml(a.minecraftUsername)}</span>
      <span class="mini-tag">💬 ${escapeHtml(a.discordUsername)}</span>
      ${a.availability ? `<span class="mini-tag">🕒 ${escapeHtml(a.availability)}</span>` : ""}
    </div>

    <div class="modal-field">
      <label>What are they good at?</label>
      <div class="value">${escapeHtml(a.skills)}</div>
    </div>

    ${a.experience ? `
    <div class="modal-field">
      <label>Relevant experience</label>
      <div class="value">${escapeHtml(a.experience)}</div>
    </div>` : ""}

    <div class="modal-field">
      <label>Why they want to join</label>
      <div class="value">${escapeHtml(a.whyJoin)}</div>
    </div>

    <div class="modal-field">
      <label>Status</label>
      <select class="app-status-select" data-id="${a.id}" style="max-width:220px;">
        <option value="pending" ${a.status === "pending" ? "selected" : ""}>Pending</option>
        <option value="reviewing" ${a.status === "reviewing" ? "selected" : ""}>Reviewing</option>
        <option value="accepted" ${a.status === "accepted" ? "selected" : ""}>Accepted</option>
        <option value="rejected" ${a.status === "rejected" ? "selected" : ""}>Rejected</option>
      </select>
    </div>`;

  content.querySelector("#app-modal-close").addEventListener("click", closeApplicationModal);
  content.querySelector(".app-status-select").addEventListener("change", async (e) => {
    const id = e.target.getAttribute("data-id");
    try {
      await updateApplicationStatus(id, e.target.value);
      showToast("Status updated");
      await renderApplicationsDashboard();
    } catch (err) {
      console.error(err);
      showToast("Couldn't update status — try again.");
    }
  });

  overlay.style.display = "flex";
}

function closeApplicationModal() {
  const overlay = document.getElementById("app-modal");
  if (overlay) overlay.style.display = "none";
}

function initAppModal() {
  const overlay = document.getElementById("app-modal");
  if (!overlay || overlay.dataset.bound) return;
  overlay.dataset.bound = "1";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeApplicationModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeApplicationModal();
  });
}

let activeAppFilter = "all";

async function renderApplicationsDashboard() {
  const tbody = document.querySelector("#applications-table tbody");
  if (!tbody) return;
  const all = await getApplications();

  const counts = { pending: 0, reviewing: 0, accepted: 0, rejected: 0 };
  all.forEach((a) => (counts[a.status] = (counts[a.status] || 0) + 1));
  const setStat = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setStat("app-stat-total", all.length);
  setStat("app-stat-pending", counts.pending || 0);
  setStat("app-stat-reviewing", counts.reviewing || 0);
  setStat("app-stat-accepted", counts.accepted || 0);

  const filtered = activeAppFilter === "all" ? all : all.filter((a) => a.status === activeAppFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dimmer); padding:40px;">No applications${activeAppFilter !== "all" ? " with this status" : " yet"}.</td></tr>`;
    return;
  }

  const accountCounts = {};
  all.forEach((a) => {
    accountCounts[a.submittedById] = (accountCounts[a.submittedById] || 0) + 1;
  });

  tbody.innerHTML = filtered
    .map((a) => {
      const dupeCount = accountCounts[a.submittedById] || 1;
      return `
    <tr>
      <td>
        <div class="cell-title">${escapeHtml(a.minecraftUsername)}</div>
        <div class="cell-sub">${escapeHtml(a.discordUsername)}</div>
      </td>
      <td>
        <div class="cell-title">${escapeHtml(a.submittedByEmail) || escapeHtml(a.submittedByName) || "—"}</div>
        ${dupeCount > 1 ? `<div class="cell-sub" style="color:var(--yellow);">⚠ ${dupeCount} submissions from this account</div>` : `<div class="cell-sub">${escapeHtml(a.submittedByName) || ""}</div>`}
      </td>
      <td>${POSITION_LABELS[a.position] || a.position}</td>
      <td>${escapeHtml(a.availability) || "—"}</td>
      <td>
        <div class="cell-title">${formatDate(a.submittedAt)}</div>
        <div class="cell-sub">${timeAgo(a.submittedAt)}</div>
      </td>
      <td>
        <select class="app-status-select" data-id="${a.id}">
          <option value="pending" ${a.status === "pending" ? "selected" : ""}>Pending</option>
          <option value="reviewing" ${a.status === "reviewing" ? "selected" : ""}>Reviewing</option>
          <option value="accepted" ${a.status === "accepted" ? "selected" : ""}>Accepted</option>
          <option value="rejected" ${a.status === "rejected" ? "selected" : ""}>Rejected</option>
        </select>
      </td>
      <td><button class="btn-link app-view-btn" data-id="${a.id}">View</button></td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".app-view-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const list = await getApplications();
      const a = list.find((x) => x.id === id);
      if (a) openApplicationModal(a);
    });
  });

  tbody.querySelectorAll(".app-status-select").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      try {
        await updateApplicationStatus(id, e.target.value);
        showToast("Status updated");
        await renderApplicationsDashboard();
      } catch (err) {
        console.error(err);
        showToast("Couldn't update status — try again.");
      }
    });
  });
}

function initAppFilterTabs() {
  const tabs = document.querySelectorAll(".app-filter-tab");
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeAppFilter = tab.getAttribute("data-filter");
      renderApplicationsDashboard();
    });
  });
}

/* ---------- Init ---------- */

async function renderAll() {
  renderNav();
  initRequestForm();
  await initMyBookings();
  initApplyForm();
  await initMyApplications();
  await initDashboard();
  initAppModal();
}

document.addEventListener("DOMContentLoaded", () => {
  initGoogleSignIn();
  renderAll();
  initFilterTabs();
  initAppFilterTabs();
});
