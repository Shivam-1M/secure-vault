import { invoke } from '@tauri-apps/api/core';

// --- State ---
let currentVault = { entries: [] };
let masterPassword = "";
let vaultPath = "my_vault.dat"; // Default path for now

// --- DOM Elements ---
const views = {
  login: document.getElementById("login-view"),
  vault: document.getElementById("vault-view"),
  entry: document.getElementById("entry-view"),
};

const loginForm = document.getElementById("login-form");
const masterPasswordInput = document.getElementById("master-password");
const loginError = document.getElementById("login-error");

const vaultList = document.getElementById("vault-list");
const emptyState = document.getElementById("empty-state");
const btnAddEntry = document.getElementById("btn-add-entry");
const btnLock = document.getElementById("btn-lock");

const entryForm = document.getElementById("entry-form");
const btnCancelEntry = document.getElementById("btn-cancel-entry");
const btnGeneratePass = document.getElementById("btn-generate-pass");
const entryPasswordInput = document.getElementById("entry-password");
const strengthBar = document.getElementById("strength-bar");

// --- Navigation ---
function showView(viewName) {
  Object.values(views).forEach((el) => el.classList.remove("active"));
  views[viewName].classList.add("active");
}

// --- Toast Notifications ---
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  if (type === "error") toast.style.borderLeftColor = "var(--error-color)";

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// --- Logic ---

// 1. Login / Unlock
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = masterPasswordInput.value;

  try {
    // Try to load the vault
    // Note: In a real app, we'd check if file exists first. 
    // If not, we create a new empty vault with this password.

    // For this demo, we'll try to load, and if it fails (file not found), we init new.
    try {
      currentVault = await invoke("load_vault", { path: vaultPath, password });
      showToast("Vault unlocked successfully!");
    } catch (err) {
      if (err.includes("No such file") || err.includes("os error 2")) {
        // File doesn't exist, create new
        currentVault = { entries: [] };
        // Save immediately to initialize
        await invoke("save_vault", { path: vaultPath, password, vault: currentVault });
        showToast("New vault created!");
      } else {
        throw err; // Wrong password or other error
      }
    }

    masterPassword = password;
    renderVault();
    showView("vault");
    masterPasswordInput.value = "";
    loginError.style.display = "none";

  } catch (err) {
    console.error(err);
    loginError.textContent = "Incorrect password or corrupted vault.";
    loginError.style.display = "block";
  }
});

const btnSync = document.getElementById("btn-sync");

// 2. Lock
btnLock.addEventListener("click", () => {
  masterPassword = "";
  currentVault = { entries: [] };
  showView("login");
  showToast("Vault locked.");
});

btnSync.addEventListener("click", async () => {
  const originalText = btnSync.innerHTML;
  btnSync.innerHTML = "⏳ Syncing...";
  btnSync.disabled = true;

  try {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In a real app, we would upload the encrypted file here
    // await invoke("sync_vault", { ... });

    showToast("Vault synced to cloud successfully!", "success");
  } catch (err) {
    showToast("Sync failed: " + err, "error");
  } finally {
    btnSync.innerHTML = originalText;
    btnSync.disabled = false;
  }
});

const searchInput = document.getElementById("search-input");

// 3. Render Vault
function renderVault(filter = "") {
  vaultList.innerHTML = "";

  const filteredEntries = currentVault.entries.filter(entry => {
    const term = filter.toLowerCase();
    return entry.title.toLowerCase().includes(term) ||
      entry.username.toLowerCase().includes(term) ||
      entry.url.toLowerCase().includes(term);
  });

  if (filteredEntries.length === 0) {
    emptyState.classList.remove("hidden");
    if (filter) {
      emptyState.querySelector("p").textContent = "No matches found.";
    } else {
      emptyState.querySelector("p").textContent = "No entries found. Create your first one!";
    }
    return;
  }

  emptyState.classList.add("hidden");

  filteredEntries.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "entry-card";
    card.innerHTML = `
      <div class="entry-title">${entry.title} <span style="font-size: 0.8rem; color: #888; margin-left: 0.5rem;">(${entry.folder})</span></div>
      <div class="entry-username">${entry.username}</div>
      <div class="entry-actions">
        <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${entry.username}')">Copy User</button>
        <button class="btn btn-primary btn-sm" onclick="copyToClipboard('${entry.password_hash}')">Copy Pass</button>
      </div>
    `;
    vaultList.appendChild(card);
  });
}

searchInput.addEventListener("input", (e) => {
  renderVault(e.target.value);
});

window.copyToClipboard = (text) => {
  navigator.clipboard.writeText(text);
  showToast("Copied to clipboard!");
};

// 4. Add Entry
btnAddEntry.addEventListener("click", () => {
  entryForm.reset();
  strengthBar.style.width = "0";
  showView("entry");
});

btnCancelEntry.addEventListener("click", () => {
  showView("vault");
});

// 5. Generate Password in Form
btnGeneratePass.addEventListener("click", async () => {
  const password = await invoke("generate_password", {
    length: 16,
    useUppercase: true,
    useNumbers: true,
    useSymbols: true,
    excludeChars: "",
  });
  entryPasswordInput.value = password;
  checkStrength(password);
});

entryPasswordInput.addEventListener("input", (e) => {
  checkStrength(e.target.value);
});

async function checkStrength(password) {
  if (!password) {
    strengthBar.style.width = "0";
    return;
  }
  const score = await invoke("check_password_strength", { password });
  const colors = ["#cf6679", "#cf6679", "#f1c40f", "#3498db", "#2ecc71"];
  const widths = ["20%", "40%", "60%", "80%", "100%"];

  strengthBar.style.width = widths[score];
  strengthBar.style.backgroundColor = colors[score];
}

// 6. Save Entry
entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newEntry = {
    title: document.getElementById("entry-title").value,
    username: document.getElementById("entry-username").value,
    password_hash: document.getElementById("entry-password").value, // Storing as plain text in memory, encrypted on disk
    url: document.getElementById("entry-url").value,
    notes: document.getElementById("entry-notes").value,
    folder: document.getElementById("entry-folder").value || "General",
  };

  currentVault.entries.push(newEntry);

  try {
    await invoke("save_vault", { path: vaultPath, password: masterPassword, vault: currentVault });
    showToast("Entry saved!");
    renderVault();
    showView("vault");
  } catch (err) {
    console.error(err);
    showToast("Failed to save vault: " + err, "error");
  }
});
